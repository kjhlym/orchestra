import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, TerminalSquare } from 'lucide-react';
import { getAgentStatusLabel, getAgentTypeLabel } from '@/lib/display';

type Agent = {
  name: string;
  type: string;
  status: string;
  currentTask: string | null;
};

export default function AgentCard({ agent }: { agent: Agent }) {
  const statusColors: Record<string, string> = {
    idle: 'bg-gray-100 text-gray-800',
    running: 'bg-green-100 text-green-800 animate-pulse',
    paused: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="p-4 pb-2 border-b">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{agent.name}</CardTitle>
              <div className="text-sm text-muted-foreground">{getAgentTypeLabel(agent.type)} 에이전트</div>
            </div>
          </div>
          <Badge variant="outline" className={statusColors[agent.status] || 'bg-gray-100'}>
            {getAgentStatusLabel(agent.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase">현재 작업</div>
          <div className="text-sm font-medium mt-1 truncate">
            {agent.currentTask || '할당 대기 중...'}
          </div>
        </div>
        
          <div className="flex-1 bg-gray-900 rounded-md p-3 text-green-400 font-mono text-xs overflow-y-auto max-h-32 shadow-inner">
            <div className="flex items-center gap-1 text-gray-500 mb-2 border-b border-gray-800 pb-1">
              <TerminalSquare className="w-3 h-3" />
              <span>터미널 실시간 로그</span>
            </div>
            <div className="space-y-1">
              <div>&gt; 에이전트 초기화 완료</div>
              {agent.status === 'running' ? (
                <>
                  {agent.type === 'critic' ? (
                    <>
                      <div>&gt; 중복 섹션과 불필요한 렌더링을 비평 중...</div>
                      <div>&gt; 구조 단순화 제안 생성 중... <span className="animate-pulse">_</span></div>
                    </>
                  ) : (
                    <>
                      <div>&gt; 백로그 컨텍스트 수신 중...</div>
                      <div>&gt; 구조 생성 중... <span className="animate-pulse">_</span></div>
                    </>
                  )}
                </>
              ) : null}
            </div>
          </div>
      </CardContent>
    </Card>
  );
}
