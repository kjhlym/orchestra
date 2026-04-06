import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GripVertical } from 'lucide-react';
import { getBacklogPriorityLabel } from '@/lib/display';

type BacklogItemData = {
  title: string;
  description?: string | null;
  priority: string;
  storyPoints: number | null;
  userStory: string | null;
  acceptanceCriteria?: string | null;
};

export default function BacklogItem({ item }: { item: BacklogItemData }) {
  const priorityColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    medium: 'bg-blue-100 text-blue-800 border-blue-200',
    low: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  const acceptanceCriteria = item.acceptanceCriteria
    ?.split(/\r?\n/)
    .map((criterion) => criterion.replace(/^-\s*/, '').trim())
    .filter(Boolean);

  return (
    <Card className="mb-3 hover:border-gray-400 transition-colors">
      <CardContent className="p-4 flex items-start gap-4">
        <div className="mt-1 cursor-grab text-gray-400 hover:text-gray-600">
          <GripVertical className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">{item.title}</h4>
            <div className="flex gap-2">
              <Badge variant="outline" className={priorityColors[item.priority] || 'bg-gray-100'}>
                {getBacklogPriorityLabel(item.priority)}
              </Badge>
              {item.storyPoints && (
                <Badge variant="secondary" className="font-mono">
                  {item.storyPoints}p
                </Badge>
              )}
            </div>
          </div>
          {item.description && (
            <p className="text-sm text-gray-600">
              {item.description}
            </p>
          )}
          {item.userStory && (
            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded-md italic">
              &ldquo;{item.userStory}&rdquo;
            </div>
          )}
          {acceptanceCriteria && acceptanceCriteria.length > 0 && (
            <div className="rounded-md border bg-white p-3">
              <div className="text-xs font-semibold text-gray-500">인수 기준</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {acceptanceCriteria.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
