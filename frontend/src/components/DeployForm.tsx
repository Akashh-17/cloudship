import { useState } from "react";
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
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="repo">GitHub URL</label>
        <input
          id="repo"
          type="text"
          placeholder="https://github.com/user/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          disabled={loading}
          autoFocus
        />
        {error && <div className="error-text">{error}</div>}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="branch">Branch</label>
          <input
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

        <div className="form-group">
          <label htmlFor="frontendDir">Frontend Directory</label>
          <input
            id="frontendDir"
            type="text"
            placeholder="./ (auto-detected)"
            value={frontendDir}
            onChange={(e) => setFrontendDir(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="slug">Custom URL (Optional)</label>
        <input
          id="slug"
          type="text"
          placeholder="something-unique"
          value={customSlug}
          onChange={(e) => setCustomSlug(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <div className="env-header">
          <label style={{ margin: 0 }}>Environment Variables</label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addEnvVar} disabled={loading}>
            + Add
          </button>
        </div>

        {envVars.map((pair) => (
          <div key={pair.id} className="env-row">
            <input
              type="text"
              placeholder="Name"
              value={pair.key}
              onChange={(e) => updateEnvVar(pair.id, "key", e.target.value)}
              disabled={loading}
              style={{ flex: 1 }}
            />
            <input
              type="text"
              placeholder="Value"
              value={pair.value}
              onChange={(e) => updateEnvVar(pair.id, "value", e.target.value)}
              disabled={loading}
              style={{ flex: 1 }}
            />
            <button type="button" className="icon-btn" onClick={() => removeEnvVar(pair.id)} disabled={loading}>
              −
            </button>
          </div>
        ))}
      </div>

      <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
        {loading ? "Deploying…" : "Deploy"}
      </button>
    </form>
  );
}
