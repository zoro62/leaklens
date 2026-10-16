export type Box = { x: number; y: number; width: number; height: number };
export type Category = 'email' | 'phone' | 'credential' | 'booking' | 'order' | 'address' | 'context' | 'travel' | 'qr' | 'manual';
export type Severity = 'high' | 'medium' | 'context';
export type Finding = {
  id: string; category: Category; detectorId: string; label: string; explanation: string;
  severity: Severity; confidenceBand: 'strong' | 'moderate'; evidenceSource: 'OCR' | 'QR' | 'manual';
  boxes: Box[]; relatedGroupIds: string[]; selectedForRedaction: boolean; dismissed: boolean;
  observation: 'direct' | 'inference'; evidence: string; qrId?: string;
};
export type ExposureGroup = { id: string; ruleId: string; title: string; explanation: string; memberFindingIds: string[]; severity: Severity; limitations: string };
export type ProcessingStatus = 'complete' | 'failed';
export type ScanMode = 'standard' | 'thorough';
export type AnalysisResult = { width: number; height: number; findings: Finding[]; exposureGroups: ExposureGroup[]; ocrStatus: ProcessingStatus; qrStatus: ProcessingStatus; warnings: string[]; timing: { totalMs: number }; scanMode?: ScanMode; tilesCompleted?: number; tilesTotal?: number };
export type Word = { text: string; box: Box; start: number; end: number; block: number };
export type Evidence = { text: string; words: Word[]; source: 'OCR' | 'QR'; qrBox?: Box; qrId?: string };
