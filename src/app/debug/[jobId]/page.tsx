"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function DebugPage() {
  const params = useParams() as { jobId: string };
  const [job, setJob] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/jobs/${params.jobId}`).then(r=>r.json()).then(d=>setJob(d.job));
    fetch(`/api/jobs/${params.jobId}/result`).then(r=>r.json()).then(d=>setResult(d)).catch(()=>{});
  }, [params.jobId]);

  return (
    <div className="p-6 font-mono text-xs">
      <h1 className="text-lg font-bold mb-4">Debug — Job {params.jobId}</h1>
      <pre className="bg-gray-100 p-4 rounded overflow-auto">{JSON.stringify(job, null, 2)}</pre>
      <pre className="bg-gray-50 p-4 rounded overflow-auto mt-4">{JSON.stringify(result, null, 2).slice(0,5000)}</pre>
    </div>
  );
}
