import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Copy, Check, ShieldAlert } from "lucide-react";

function CodeBlock({ code, testId }: { code: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="bg-muted rounded-md p-4 pr-12 text-xs overflow-x-auto whitespace-pre" data-testid={testId}>{code}</pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 h-7 w-7"
        onClick={() => {
          navigator.clipboard?.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

export function collectorCommands(serverId: string, serverName: string, apiKey: string) {
  const url = window.location.origin;
  return {
    docker: `docker run -d --name gpu-monitor-collector --restart unless-stopped \\
  --gpus all --pid host --network host \\
  -e CENTRAL_API_URL=${url} \\
  -e CENTRAL_API_KEY=${apiKey} \\
  -e SERVER_ID=${serverId} \\
  -e SERVER_NAME="${serverName}" \\
  -e INTERVAL_SEC=30 \\
  gpu-monitor-collector:latest`,
    python: `# on the GPU server (Python 3.8+)
git clone <this-repo> gpu-monitor && cd gpu-monitor/collector
pip install -r requirements.txt
CENTRAL_API_URL=${url} \\
CENTRAL_API_KEY=${apiKey} \\
SERVER_ID=${serverId} \\
python3 collector.py`,
    systemd: `# /etc/gpu-monitor-collector.env
CENTRAL_API_URL=${url}
CENTRAL_API_KEY=${apiKey}
SERVER_ID=${serverId}
SERVER_NAME=${serverName}
INTERVAL_SEC=30

# then, from the repository:
sudo ./scripts/install_collector.sh --systemd`,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  serverName: string;
  apiKey: string;
}

export default function InstallInstructionsDialog({ open, onOpenChange, serverId, serverName, apiKey }: Props) {
  const cmds = collectorCommands(serverId, serverName, apiKey);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="install-dialog">
        <DialogHeader>
          <DialogTitle>Install the collector on {serverName}</DialogTitle>
          <DialogDescription>
            The server appears as "Waiting for data" until the collector sends its first report.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            This key is shown <strong>only once</strong>. It only allows sending metrics for this server. You can rotate it any time from the server page.
          </AlertDescription>
        </Alert>
        <CodeBlock code={apiKey} testId="server-api-key" />

        <Tabs defaultValue="docker">
          <TabsList>
            <TabsTrigger value="docker">Docker</TabsTrigger>
            <TabsTrigger value="systemd">systemd</TabsTrigger>
            <TabsTrigger value="python">Python</TabsTrigger>
          </TabsList>
          <TabsContent value="docker"><CodeBlock code={cmds.docker} /></TabsContent>
          <TabsContent value="systemd"><CodeBlock code={cmds.systemd} /></TabsContent>
          <TabsContent value="python"><CodeBlock code={cmds.python} /></TabsContent>
        </Tabs>
        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)} data-testid="close-install-dialog">Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
