import { GoogleGenAI } from '@google/genai';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config/env.js';
import { HttpError } from '../../utils/errors.js';
import { z } from 'zod';

export const aiProposalSchema = z.object({
  actionType: z.enum(['CREATE_TASK', 'DAILY_PLAN', 'TASK_BREAKDOWN']),
  payload: z.record(z.string(), z.any()),
});

export class AIService {
  private ai: GoogleGenAI | null = null;

  constructor(
    private prisma: PrismaClient,
    private config: Config,
  ) {
    if (config.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    }
  }

  async listConversations(ownerId: string) {
    return this.prisma.aIConversation.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async createConversation(ownerId: string, title?: string) {
    return this.prisma.aIConversation.create({
      data: {
        ownerId,
        title: title || 'New Conversation',
      },
    });
  }

  async getMessages(ownerId: string, conversationId: string) {
    const conv = await this.prisma.aIConversation.findFirst({
      where: { id: conversationId, ownerId },
    });
    if (!conv) throw new HttpError(404, 'NOT_FOUND', 'Conversation not found');

    return this.prisma.aIMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMessage(ownerId: string, conversationId: string, content: string) {
    const conv = await this.prisma.aIConversation.findFirst({
      where: { id: conversationId, ownerId },
    });
    if (!conv) throw new HttpError(404, 'NOT_FOUND', 'Conversation not found');

    // Save user message
    const userMsg = await this.prisma.aIMessage.create({
      data: {
        conversationId,
        role: 'user',
        content,
      },
    });

    // Check Gemini configuration
    if (!this.ai) {
      const fallback = await this.prisma.aIMessage.create({
        data: {
          conversationId,
          role: 'model',
          content: 'Gemini API key is not configured in backend/.env (GEMINI_API_KEY). Please add your key to enable live AI responses.',
        },
      });
      return { userMessage: userMsg, modelMessage: fallback };
    }

    // Context retrieval (active tasks, recent notes)
    const [tasks, notes] = await Promise.all([
      this.prisma.task.findMany({
        where: { ownerId, status: { not: 'COMPLETED' } },
        take: 10,
        select: { id: true, title: true, priority: true, dueAt: true },
      }),
      this.prisma.note.findMany({
        where: { ownerId, archived: false },
        take: 5,
        select: { id: true, title: true, rawText: true },
      }),
    ]);

    const systemPrompt = `You are TaskMate AI, an intelligent personal productivity assistant for the owner.
You assist with planning, summarizing, task breakdown, schedule management, and actionable advice.
Current pending tasks: ${JSON.stringify(tasks)}
Recent notes: ${JSON.stringify(notes)}
Be concise, proactive, clear, and prioritize actionable steps.`;

    try {
      const replyText = await this.callGeminiWithFallback([
        { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser: ${content}` }] },
      ]);

      const modelMsg = await this.prisma.aIMessage.create({
        data: {
          conversationId,
          role: 'model',
          content: replyText,
        },
      });

      await this.prisma.aIConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return { userMessage: userMsg, modelMessage: modelMsg };
    } catch (err: any) {
      // If live AI call still failed after trying all fallback models, generate a helpful assistant response
      let fallbackContent = 'I encountered a temporary connection issue reaching the AI service. ';
      const lower = content.toLowerCase();
      if (lower.includes('task') || lower.includes('create') || lower.includes('plan') || lower.includes('schedule')) {
        fallbackContent += `I have noted your request: "${content}". You can view and manage your scheduled tasks under the Tasks tab or click the + button to add it directly.`;
      } else {
        fallbackContent += 'Please try again in a few moments, or check your connection.';
      }

      const fallbackMsg = await this.prisma.aIMessage.create({
        data: {
          conversationId,
          role: 'model',
          content: fallbackContent,
        },
      });
      return { userMessage: userMsg, modelMessage: fallbackMsg };
    }
  }

  private async callGeminiWithFallback(contents: any): Promise<string> {
    if (!this.ai) throw new Error('Gemini API key is not configured');

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.8-flash',
    ];

    let lastError: any = null;

    for (const model of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await this.ai.models.generateContent({
            model,
            contents,
          });
          if (response.text) return response.text;
        } catch (err: any) {
          lastError = err;
          // If 503 high demand or temporary failure, wait slightly and try next
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }

    throw lastError || new Error('All Gemini candidate models are currently busy. Please try again in a few moments.');
  }
  async createProposal(ownerId: string, actionType: string, prompt: string) {
    if (!this.ai) {
      // Deterministic fallback proposal
      return this.prisma.aIProposal.create({
        data: {
          ownerId,
          actionType,
          payload: {
            title: prompt,
            priority: 'HIGH',
            description: 'Created via AI natural language workflow (offline fallback)',
            subtasks: ['Review plan', 'Execute task'],
          },
          status: 'PROPOSED',
        },
      });
    }

    const extractionPrompt = `Extract a structured task plan from this prompt: "${prompt}".
Output valid JSON ONLY matching:
{
  "title": string,
  "description": string,
  "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  "subtasks": string[]
}`;

    let payload: any;
    try {
      const replyText = await this.callGeminiWithFallback([
        { role: 'user', parts: [{ text: extractionPrompt }] },
      ]);
      const text = replyText.replace(/```json|```/g, '').trim();
      payload = JSON.parse(text);
    } catch {
      payload = {
        title: prompt,
        priority: 'MEDIUM',
        description: 'Auto-structured plan for: ' + prompt,
        subtasks: ['Setup environment', 'Implement core logic', 'Test and verify'],
      };
    }

    return this.prisma.aIProposal.create({
      data: {
        ownerId,
        actionType,
        payload,
        status: 'PROPOSED',
      },
    });
  }

  // Mandatory confirmation workflow: Step 2 (Execute confirmed proposal)
  async confirmProposal(ownerId: string, proposalId: string) {
    const proposal = await this.prisma.aIProposal.findFirst({
      where: { id: proposalId, ownerId, status: 'PROPOSED' },
    });
    if (!proposal) throw new HttpError(404, 'NOT_FOUND', 'Proposal not found or already consumed');

    const payload = proposal.payload as any;
    let createdRecord: any = null;

    if (proposal.actionType === 'CREATE_TASK' || proposal.actionType === 'TASK_BREAKDOWN') {
      createdRecord = await this.prisma.task.create({
        data: {
          ownerId,
          title: payload.title || 'Untitled AI Task',
          description: payload.description || '',
          priority: payload.priority || 'MEDIUM',
          subtasks: payload.subtasks && payload.subtasks.length > 0 ? {
            create: payload.subtasks.map((st: string, idx: number) => ({
              title: st,
              position: idx,
              ownerId,
            })),
          } : undefined,
        },
        include: { subtasks: true },
      });
    }

    await this.prisma.aIProposal.update({
      where: { id: proposalId },
      data: { status: 'CONSUMED' },
    });

    return { proposal, result: createdRecord };
  }
}
