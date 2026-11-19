import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { PermissionGuard } from '@/components/PermissionGuard';
import { RadiografiaExpress } from '@/components/georadar/RadiografiaExpress';

export const dynamic = 'force-dynamic';

export default async function RadiografiaPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <PermissionGuard permission="module:georadar">
      <RadiografiaExpress />
    </PermissionGuard>
  );
}
