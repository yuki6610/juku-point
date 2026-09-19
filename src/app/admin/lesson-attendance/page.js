import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/lesson-records?tab=attendance');
}
