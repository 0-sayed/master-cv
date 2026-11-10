import type { SourceFile } from "typescript/unstable/ast";
export function parseSource(file: string, source: string): SourceFile;
export function closeParser(): void;
