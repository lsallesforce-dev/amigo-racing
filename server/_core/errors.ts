export class ForbiddenError extends Error { constructor(message: string) { super(message); this.name = 'ForbiddenError'; } }
export function ForbiddenErrorFunc(message: string) { return new ForbiddenError(message); }
