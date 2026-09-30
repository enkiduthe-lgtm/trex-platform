import { Role } from './roles';
export interface JwtClaims { sub: string; email: string; role: Role; sid: string; }
export interface RequestUser { id: string; email: string; role: Role; sessionId: string; }
