import { useState } from "react";
import { Plus, Minus, AlertCircle, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cloudshipApi } from "../api/cloudship";
import type { Deployment } from "../api/cloudship";

interface EnvVarPair {
  id: string;
  key: string;
  value: string;
}

const RECENT_BRANCHES = ["main", "master", "dev", "develop", "staging"];

interface DeployFormProps {
  onDeployed: (deployment: Deployment) => void;
}

export default function DeployForm({ onDeployed }: DeployFormProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [frontendDir, setFrontendDir] = useState("./");
  const [customSlug, setCustomSlug] = useState("");
  const [envVars, setEnvVars] = useState<EnvVarPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addEnvVar = () => {
    setEnvVars([...envVars, { id: Date.now().toString(), key: "", value: "" }]);
  };

  const removeEnvVar = (id: string) => {
    setEnvVars(envVars.filter((item) => item.id !== id));
  };

  const updateEnvVar = (id: string, field: "key" | "value", val: string) => {
    setEnvVars(envVars.map((item) => (item.id === id ? { ...item, [field]: val } : item)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      setError("Please enter a GitHub repository URL");
      return;
    }
    if (!repoUrl.trim().startsWith("https://github.com/")) {
      setError("URL must start with https://github.com/");
      return;
    }

    setError(null);
    setLoading(true);

    const formattedEnvVars: Record<string, string> = {};
    envVars.forEach((pair) => {
      if (pair.key.trim()) formattedEnvVars[pair.key.trim()] = pair.value;
    });

    try {
      const newDeployment = await cloudshipApi.createDeployment({
        repoUrl: repoUrl.trim(),
        branch: branch.trim() || "main",
        frontendDir: frontendDir.trim() || "./",
        customSlug: customSlug.trim() || undefined,
        envVars: Object.keys(formattedEnvVars).length > 0 ? formattedEnvVars : undefined,
      });
      onDeployed(newDeployment);
    } catch (err: any) {
      setError(err.message || "Failed to start deployment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="repo">GitHub repository URL</Label>
        <Input
          id="repo"
          type="text"
          placeholder="https://github.com/user/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          disabled={loading}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="branch">Branch</Label>
          <Input
            id="branch"
            type="text"
            list="branch-suggestions"
            placeholder="main"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={loading}
          />
          <datalist id="branch-suggestions">
            {RECENT_BRANCHES.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>

        <div className="space-y-2">
          <Label htmlFor="frontendDir">Frontend directory</Label>
          <Input
            id="frontendDir"
            type="text"
            placeholder="./ (auto)"
            value={frontendDir}
            onChange={(e) => setFrontendDir(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Custom URL (optional)</Label>
        <Input
          id="slug"
          type="text"
          placeholder="something-unique"
          value={customSlug}
          onChange={(e) => setCustomSlug(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <Label className="mb-0">Environment variables</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addEnvVar} disabled={loading} className="h-7 px-2.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {envVars.length > 0 && (
          <div className="space-y-2">
            {envVars.map((pair) => (
              <div key={pair.id} className="flex gap-2">
                <Input
                  type="text"
                  placeholder="NAME"
                  value={pair.key}
                  onChange={(e) => updateEnvVar(pair.id, "key", e.target.value)}
                  disabled={loading}
                  className="font-mono text-xs"
                />
                <Input
                  type="text"
                  placeholder="value"
                  value={pair.value}
                  onChange={(e) => updateEnvVar(pair.id, "value", e.target.value)}
                  disabled={loading}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeEnvVar(pair.id)}
                  disabled={loading}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? (
          "Deploying…"
        ) : (
          <>
            <Rocket className="h-4 w-4" />
            Deploy
          </>
        )}
      </Button>
    </form>
  );
}
