import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Cpu, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/queryClient";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, register } = useAuth();

  const { data: authConfig } = useQuery<{ registrationOpen: boolean }>({
    queryKey: ["/api/auth/config"],
    queryFn: () => fetch("/api/auth/config").then((r) => r.json()),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      if (mode === "login") await login(username, password);
      else await register(username, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError("Too many attempts, please wait a few minutes.");
      else if (mode === "login") setError("Invalid username or password");
      else setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Cpu className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold">GPU Monitor</CardTitle>
          </div>
          <p className="text-muted-foreground">{mode === "login" ? "Sign in to access the dashboard" : "Create your account"}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" data-testid="error-message">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={mode === "register" ? 3 : undefined} data-testid="input-username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "register" ? 8 : undefined}
                  className="pr-10"
                  data-testid="input-password"
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowPassword(!showPassword)} data-testid="toggle-password" aria-label="Show password">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading} data-testid="login-button">
              {isLoading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
            {authConfig?.registrationOpen && (
              <p className="text-center text-sm text-muted-foreground">
                {mode === "login" ? "No account yet? " : "Already have an account? "}
                <button type="button" className="text-primary hover:underline" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} data-testid="toggle-mode">
                  {mode === "login" ? "Create one" : "Sign in"}
                </button>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
