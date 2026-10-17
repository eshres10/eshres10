import { useEffect, useState } from 'react';
import { useSearch } from 'wouter';
import { ForumBoard, ForumKind } from '@workspace/api-client-react';
import { ForumFlow } from '@/components/forum-flow/ForumFlow';

/** /forum/new (?board= and ?kind= preselect). */
export function NewTopicPage() {
  const params = new URLSearchParams(useSearch());
  const kind = params.get('kind'), board = params.get('board');
  const initialKind = (Object.values(ForumKind) as string[]).includes(kind ?? '') ? kind as ForumKind : null;
  const initialBoard = (Object.values(ForumBoard) as string[]).includes(board ?? '') ? board as ForumBoard : null;
  const [run, setRun] = useState(0);
  useEffect(() => { document.title = 'New discussion · Seams Club'; }, []);
  return <ForumFlow key={run} initialKind={initialKind} initialBoard={initialBoard} onRestart={() => setRun(r => r + 1)} />;
}
