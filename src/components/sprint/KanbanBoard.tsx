import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserCircle } from 'lucide-react';

type TaskCard = {
  id: string;
  title: string;
  status: string;
  assignedAgent: string | null;
};

export default function KanbanBoard({ tasks }: { tasks: TaskCard[] }) {
  const columns = [
    { id: 'todo', title: '할 일', bgColor: 'bg-gray-100' },
    { id: 'inProgress', title: '진행 중', bgColor: 'bg-blue-50' },
    { id: 'review', title: '검토', bgColor: 'bg-yellow-50' },
    { id: 'done', title: '완료', bgColor: 'bg-green-50' }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[600px]">
      {columns.map(column => {
        const columnTasks = tasks.filter(t => t.status === column.id);
        return (
          <div key={column.id} className={`${column.bgColor} p-4 rounded-lg flex flex-col border border-dashed`}>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold">{column.title}</h4>
              <Badge variant="secondary">{columnTasks.length}</Badge>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3">
              {columnTasks.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-8">작업이 없습니다</div>
              ) : (
                columnTasks.map(task => (
                  <Card key={task.id} className="cursor-grab hover:border-blue-300">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-sm font-medium">{task.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
                      <div className="flex justify-between items-center mt-2">
                        <span>스프린트 1</span>
                        <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                          <UserCircle className="w-3 h-3" />
                          <span>{task.assignedAgent || '미배정'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
