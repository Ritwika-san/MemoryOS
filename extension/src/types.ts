export interface Memory {
  id: string;
  text: string;
  summary: string;
  category: string;
  platform: string;
  timestamp: string;
  decay_score: number;
  pinned: boolean;
}

export interface SaveMemoryRequest {
  text: string;
  platform: string;
  timestamp: string;
  decay_score: number;
}