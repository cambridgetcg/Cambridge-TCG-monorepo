import { useEffect, useRef, useState } from "react";

export function useRealtimeMetrics(url: string) {
  const [data, setData] = useState<any>(null);
  const es = useRef<EventSource | null>(null);

  useEffect(() => {
    let retry = 1000;
    const connect = () => {
      es.current = new EventSource(url, { withCredentials: true });
      es.current.addEventListener("metrics", (e) => {
        const msg = e as MessageEvent;
        setData(JSON.parse(msg.data));
      });
      es.current.onerror = () => {
        es.current?.close();
        setTimeout(connect, Math.min(retry, 30000));
        retry *= 2;
      };
    };
    connect();
    return () => es.current?.close();
  }, [url]);

  return data;
}