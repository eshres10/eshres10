import { notFound } from 'next/navigation';
import { neuroscience } from '@/content/neuroscience';
import { LessonPlayer } from '@/components/lesson/LessonPlayer';

export function generateStaticParams() {
  return neuroscience.lessons.map((l) => ({ day: String(l.day) }));
}

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ day: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const { day } = await params;
  const { review } = await searchParams;
  const lesson = neuroscience.lessons.find((l) => String(l.day) === day);
  if (!lesson) notFound();
  return <LessonPlayer lesson={lesson} reviewOnly={review === '1'} />;
}
