// app/(app)/inboxtasks/review-actions.ts
'use server';

import { revalidatePath, unstable_noStore as noStore } from 'next/cache';
import { auth } from '@/auth.config';
import { normalizeRole, canCreateTasks } from '@/lib/roles';

export async function submitForReviewAction(formData: FormData): Promise<void> {
  noStore();
  const session = await auth();
  if (!session?.user) return;
  revalidatePath('/inboxtasks');
}

export async function approveSubmissionAction(formData: FormData): Promise<void> {
  noStore();
  const session = await auth();
  const role = normalizeRole(session?.user?.role);
  if (!canCreateTasks(role)) return;
  revalidatePath('/inboxtasks');
}

export async function rejectSubmissionAction(formData: FormData): Promise<void> {
  noStore();
  const session = await auth();
  const role = normalizeRole(session?.user?.role);
  if (!canCreateTasks(role)) return;
  revalidatePath('/inboxtasks');
}
