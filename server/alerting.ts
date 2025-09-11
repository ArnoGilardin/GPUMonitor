import { storage } from "./storage";
import { sendEmail } from "./sendgrid";

interface AlertCheck {
  ruleId: string;
  serverId: string;
  value: number;
  threshold: number;
  level: "warning" | "critical";
  message: string;
}

export async function checkAlerts(serverId: string) {
  try {
    const rules = await storage.getActiveRules();
    const latestMetrics = await storage.getLatestMetrics(serverId);
    
    if (!latestMetrics) {
      return;
    }

    const alertChecks: AlertCheck[] = [];

    for (const rule of rules) {
      let value: number | undefined;
      let message: string;

      switch (rule.type) {
        case "gpu_temp":
          if (latestMetrics.gpuSnapshots.length > 0) {
            const maxTemp = Math.max(...latestMetrics.gpuSnapshots.map(g => parseFloat(g.tempC || "0")));
            value = maxTemp;
            message = `GPU temperature reached ${maxTemp}°C, exceeding threshold of ${rule.threshold}°C`;
          }
          break;
        
        case "gpu_util":
          if (latestMetrics.gpuSnapshots.length > 0) {
            const avgUtil = latestMetrics.gpuSnapshots.reduce((sum, g) => sum + parseFloat(g.utilPercent || "0"), 0) / latestMetrics.gpuSnapshots.length;
            value = avgUtil;
            message = `GPU utilization reached ${avgUtil.toFixed(1)}%, exceeding threshold of ${rule.threshold}%`;
          }
          break;
        
        case "vram_util":
          if (latestMetrics.gpuSnapshots.length > 0) {
            const avgVramUtil = latestMetrics.gpuSnapshots.reduce((sum, g) => {
              const used = g.vramUsedMB || 0;
              const total = g.vramTotalMB || 1;
              return sum + (used / total) * 100;
            }, 0) / latestMetrics.gpuSnapshots.length;
            value = avgVramUtil;
            message = `VRAM utilization reached ${avgVramUtil.toFixed(1)}%, exceeding threshold of ${rule.threshold}%`;
          }
          break;
        
        case "cpu_util":
          if (latestMetrics.sysSnapshot) {
            value = parseFloat(latestMetrics.sysSnapshot.cpuPercent || "0");
            message = `CPU utilization reached ${value}%, exceeding threshold of ${rule.threshold}%`;
          }
          break;
        
        case "disk_util":
          if (latestMetrics.sysSnapshot) {
            value = parseFloat(latestMetrics.sysSnapshot.diskPercent || "0");
            message = `Disk utilization reached ${value}%, exceeding threshold of ${rule.threshold}%`;
          }
          break;
      }

      if (value !== undefined && value >= parseFloat(rule.threshold)) {
        alertChecks.push({
          ruleId: rule.id,
          serverId,
          value,
          threshold: parseFloat(rule.threshold),
          level: rule.level as "warning" | "critical",
          message,
        });
      }
    }

    // Check if alerts should be fired (considering duration)
    for (const check of alertChecks) {
      const existingAlert = await storage.getActiveAlert(serverId, check.ruleId);
      
      if (!existingAlert) {
        // Check if the condition has been true for the required duration
        const rule = rules.find(r => r.id === check.ruleId);
        if (rule) {
          const shouldFire = await storage.checkAlertDuration(serverId, check.ruleId, rule.durationSec);
          
          if (shouldFire) {
            // Fire alert
            await storage.createAlert({
              serverId,
              ruleId: check.ruleId,
              level: check.level,
              message: check.message,
            });

            // Send notifications
            await sendNotifications(check, latestMetrics.server.name);
          }
        }
      }
    }
  } catch (error) {
    console.error("Alert checking error:", error);
  }
}

async function sendNotifications(alert: AlertCheck, serverName: string) {
  try {
    const settings = await storage.getSettings();
    const emailTo = settings.find(s => s.key === "alert_email_to")?.value;
    const webhookUrl = settings.find(s => s.key === "webhook_url")?.value;

    // Send email notification
    if (emailTo && process.env.SENDGRID_API_KEY) {
      const subject = `${alert.level.toUpperCase()} Alert: ${serverName}`;
      const html = `
        <h2>Server Monitor Alert</h2>
        <p><strong>Server:</strong> ${serverName}</p>
        <p><strong>Level:</strong> ${alert.level.toUpperCase()}</p>
        <p><strong>Message:</strong> ${alert.message}</p>
        <p><strong>Threshold:</strong> ${alert.threshold}</p>
        <p><strong>Current Value:</strong> ${alert.value}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      `;

      await sendEmail(process.env.SENDGRID_API_KEY, {
        to: emailTo,
        from: process.env.SENDGRID_FROM_EMAIL || "alerts@gpu-monitor.com",
        subject,
        html,
      });
    }

    // Send webhook notification
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          server: serverName,
          level: alert.level,
          message: alert.message,
          threshold: alert.threshold,
          value: alert.value,
          timestamp: new Date().toISOString(),
        }),
      });
    }
  } catch (error) {
    console.error("Notification sending error:", error);
  }
}
