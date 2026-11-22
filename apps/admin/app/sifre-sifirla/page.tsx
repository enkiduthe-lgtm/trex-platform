import { Suspense } from 'react';
import PasswordResetWorkspace from './password-reset-workspace';
export default function PasswordResetPage(){return <Suspense fallback={<main className="login-page">Yükleniyor…</main>}><PasswordResetWorkspace/></Suspense>;}
