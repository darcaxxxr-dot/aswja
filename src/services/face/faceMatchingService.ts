import type { EmbeddingRecord, FaceMatchCandidate } from './types';

export class FaceMatchingService {
  private static euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Embedding length mismatch: ${a.length} vs ${b.length}`);
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Embedding length mismatch: ${a.length} vs ${b.length}`);
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;
    return dot / denom;
  }

  distanceToScore(distance: number): number {
    const score = Math.max(0, Math.min(1, 1 - distance / 2));
    return Math.round(score * 1000) / 1000;
  }

  findBestMatch(
    queryEmbedding: number[],
    database: EmbeddingRecord[],
    threshold: number = 0.8
  ): { matched: boolean; candidate: FaceMatchCandidate | null; topCandidates: FaceMatchCandidate[] } {
    if (database.length === 0) {
      return { matched: false, candidate: null, topCandidates: [] };
    }

    const candidates: FaceMatchCandidate[] = database.map((rec) => {
      const dist = FaceMatchingService.euclideanDistance(queryEmbedding, rec.embedding);
      return {
        id: rec.id,
        label: rec.label,
        score: this.distanceToScore(dist),
        distance: Math.round(dist * 1000) / 1000
      };
    });

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    return {
      matched: best.score >= threshold,
      candidate: best,
      topCandidates: candidates.slice(0, 3)
    };
  }

  averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];
    const len = embeddings[0].length;
    const sum = new Array<number>(len).fill(0);
    for (const emb of embeddings) {
      for (let i = 0; i < len; i++) sum[i] += emb[i];
    }
    return sum.map((v) => v / embeddings.length);
  }
}

export const faceMatchingService = new FaceMatchingService();