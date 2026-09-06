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
    options: { threshold?: number; useCosine?: boolean; minQuality?: number } = {}
  ): { matched: boolean; candidate: FaceMatchCandidate | null; topCandidates: FaceMatchCandidate[] } {
    if (database.length === 0) {
      return { matched: false, candidate: null, topCandidates: [] };
    }

    const useCosine = options.useCosine ?? false;
    const baseThreshold = options.threshold ?? 0.48;
    const minQuality = options.minQuality ?? 0;

    const filteredDb =
      minQuality > 0
        ? database.filter((rec) => (rec.qualityScore ?? 0) >= minQuality)
        : database;

    if (filteredDb.length === 0) {
      return { matched: false, candidate: null, topCandidates: [] };
    }

    const adaptiveThreshold = FaceMatchingService.computeAdaptiveThreshold(filteredDb.length, baseThreshold);

    const candidates: FaceMatchCandidate[] = filteredDb.map((rec) => {
      // Multi-vector matching: query against all stored embeddings, take best (min distance / max score)
      const storedEmbeddings = rec.embedding as number[][];

      let bestScore = useCosine ? -1 : Infinity;
      let bestDistance = 0;

      for (const storedEmb of storedEmbeddings) {
        if (useCosine) {
          const sim = FaceMatchingService.cosineSimilarity(queryEmbedding, storedEmb);
          if (sim > bestScore) bestScore = sim;
        } else {
          const dist = FaceMatchingService.euclideanDistance(queryEmbedding, storedEmb);
          if (dist < bestScore) {
            bestScore = dist;
            bestDistance = dist;
          }
        }
      }

      const score = useCosine ? bestScore : this.distanceToScore(bestScore);
      return {
        id: rec.id,
        label: rec.label,
        score: Math.round(score * 1000) / 1000,
        distance: useCosine ? 0 : Math.round(bestDistance * 1000) / 1000
      };
    });

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    return {
      matched: best.score >= adaptiveThreshold,
      candidate: best,
      topCandidates: candidates.slice(0, 3)
    };
  }

  private static computeAdaptiveThreshold(dbSize: number, baseThreshold: number): number {
    if (dbSize <= 1) return baseThreshold;
    const lift = Math.min(0.03, Math.log10(dbSize) * 0.008);
    return Math.min(0.95, baseThreshold + lift);
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