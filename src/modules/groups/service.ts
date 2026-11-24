import type { PrismaClient } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/errors.js';
import { randomBytes } from 'node:crypto';

export class GroupService {
  constructor(private prisma: PrismaClient) {}

  // List all groups current user is a member of
  async listUserGroups(userId: string) {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            owner: { select: { id: true, name: true, username: true } },
            _count: { select: { members: true, notes: true, tasks: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    return memberships.map((m) => ({
      ...m.group,
      myRole: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  // Create a new group
  async createGroup(userId: string, data: { name: string; description?: string }) {
    const code = 'BUDD-' + randomBytes(3).toString('hex').toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: data.name,
          description: data.description || '',
          code,
          ownerId: userId,
        },
      });

      // Add creator as ADMIN member
      await tx.groupMember.create({
        data: {
          groupId: group.id,
          userId,
          role: 'ADMIN',
        },
      });

      await tx.groupActivity.create({
        data: {
          groupId: group.id,
          userId,
          action: 'created the group',
          target: data.name,
        },
      });

      return group;
    });
  }

  // Join group via code
  async joinGroupByCode(userId: string, code: string) {
    const trimmedCode = code.trim().toUpperCase();
    const group = await this.prisma.group.findUnique({
      where: { code: trimmedCode },
    });
    if (!group) throw new HttpError(404, 'NOT_FOUND', 'Group not found with this invite code');

    const existingMember = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId } },
    });
    if (existingMember) throw new HttpError(409, 'ALREADY_MEMBER', 'You are already a member of this group');

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.create({
        data: {
          groupId: group.id,
          userId,
          role: 'MEMBER',
        },
      });

      await tx.groupActivity.create({
        data: {
          groupId: group.id,
          userId,
          action: 'joined the group',
          target: group.name,
        },
      });
    });

    return group;
  }

  // Get single group details (verified member only)
  async getGroupDetails(userId: string, groupId: string) {
    await this.ensureMember(userId, groupId);

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        owner: { select: { id: true, name: true, username: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, username: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
        _count: { select: { notes: true, tasks: true } },
      },
    });

    return group;
  }

  // ----------------- GROUP NOTES -----------------
  async listGroupNotes(userId: string, groupId: string) {
    await this.ensureMember(userId, groupId);
    return this.prisma.groupNote.findMany({
      where: { groupId },
      include: {
        author: { select: { id: true, name: true, username: true } },
      },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createGroupNote(userId: string, groupId: string, data: { title: string; content: string }) {
    await this.ensureMember(userId, groupId);

    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.groupNote.create({
        data: {
          groupId,
          authorId: userId,
          title: data.title,
          content: data.content,
        },
        include: {
          author: { select: { id: true, name: true, username: true } },
        },
      });

      await tx.groupActivity.create({
        data: {
          groupId,
          userId,
          action: 'added a note',
          target: data.title,
        },
      });

      return created;
    });

    return note;
  }

  async updateGroupNote(
    userId: string,
    groupId: string,
    noteId: string,
    data: { title?: string; content?: string; pinned?: boolean },
  ) {
    await this.ensureMember(userId, groupId);
    const existing = await this.prisma.groupNote.findFirst({
      where: { id: noteId, groupId },
    });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Note not found');

    return this.prisma.groupNote.update({
      where: { id: noteId },
      data: {
        title: data.title ?? existing.title,
        content: data.content ?? existing.content,
        pinned: data.pinned ?? existing.pinned,
      },
      include: {
        author: { select: { id: true, name: true, username: true } },
      },
    });
  }

  async deleteGroupNote(userId: string, groupId: string, noteId: string) {
    const member = await this.ensureMember(userId, groupId);
    const existing = await this.prisma.groupNote.findFirst({
      where: { id: noteId, groupId },
    });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Note not found');

    if (existing.authorId !== userId && member.role !== 'ADMIN') {
      throw new HttpError(403, 'FORBIDDEN', 'Only the author or group admin can delete this note');
    }

    await this.prisma.groupNote.delete({ where: { id: noteId } });
    return { success: true };
  }

  // ----------------- GROUP TASKS -----------------
  async listGroupTasks(userId: string, groupId: string) {
    await this.ensureMember(userId, groupId);
    return this.prisma.groupTask.findMany({
      where: { groupId },
      include: {
        creator: { select: { id: true, name: true, username: true } },
        assignee: { select: { id: true, name: true, username: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async createGroupTask(
    userId: string,
    groupId: string,
    data: {
      title: string;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      assigneeId?: string;
      dueAt?: string;
    },
  ) {
    await this.ensureMember(userId, groupId);

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.groupTask.create({
        data: {
          groupId,
          creatorId: userId,
          title: data.title,
          priority: data.priority || 'MEDIUM',
          assigneeId: data.assigneeId || null,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
        },
        include: {
          creator: { select: { id: true, name: true, username: true } },
          assignee: { select: { id: true, name: true, username: true } },
        },
      });

      await tx.groupActivity.create({
        data: {
          groupId,
          userId,
          action: 'created task',
          target: data.title,
        },
      });

      return created;
    });

    return task;
  }

  async toggleGroupTaskStatus(
    userId: string,
    groupId: string,
    taskId: string,
    status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED',
  ) {
    await this.ensureMember(userId, groupId);
    const existing = await this.prisma.groupTask.findFirst({
      where: { id: taskId, groupId },
    });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Task not found');

    const updated = await this.prisma.groupTask.update({
      where: { id: taskId },
      data: { status },
      include: {
        creator: { select: { id: true, name: true, username: true } },
        assignee: { select: { id: true, name: true, username: true } },
      },
    });

    if (status === 'COMPLETED') {
      await this.prisma.groupActivity.create({
        data: {
          groupId,
          userId,
          action: 'completed task',
          target: existing.title,
        },
      });
    }

    return updated;
  }

  async deleteGroupTask(userId: string, groupId: string, taskId: string) {
    const member = await this.ensureMember(userId, groupId);
    const existing = await this.prisma.groupTask.findFirst({
      where: { id: taskId, groupId },
    });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Task not found');

    if (existing.creatorId !== userId && member.role !== 'ADMIN') {
      throw new HttpError(403, 'FORBIDDEN', 'Only the creator or group admin can delete this task');
    }

    await this.prisma.groupTask.delete({ where: { id: taskId } });
    return { success: true };
  }

  // ----------------- GROUP ACTIVITY -----------------
  async listGroupActivity(userId: string, groupId: string) {
    await this.ensureMember(userId, groupId);
    return this.prisma.groupActivity.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, name: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  // Helper
  private async ensureMember(userId: string, groupId: string) {
    const member = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!member) throw new HttpError(403, 'NOT_MEMBER', 'You are not a member of this group');
    return member;
  }
}
