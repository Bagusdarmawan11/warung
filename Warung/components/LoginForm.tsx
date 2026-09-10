'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { signIn } from '@/lib/actions/auth';
import { Input, Field } from '@/components/ui';
import { LogIn } from 'lucide-react';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-peach-400 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-peach-500 disabled:opacity-60"
    >
      <LogIn size={16} />
      {pending ? 'Memeriksa...' : 'Masuk'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(signIn, { error: undefined as string | undefined });

  return (
    <form action={formAction}>
      <Field label="Email">
        <Input type="email" name="email" required placeholder="pemilik@warung.com" autoComplete="username" />
      </Field>
      <Field label="Kata Sandi">
        <Input type="password" name="password" required placeholder="••••••••" autoComplete="current-password" />
      </Field>
      {state?.error && (
        <p className="mb-3 rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-600">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
