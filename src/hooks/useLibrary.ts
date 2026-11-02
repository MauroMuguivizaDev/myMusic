import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "../services/library";
import type { Track } from "../domain/music";
import { errorMessage } from "../domain/music";

export function useLibrary() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const subscription = liveQuery(() =>
      db.tracks.orderBy("addedAt").reverse().toArray(),
    ).subscribe({
      next: (value) => {
        setTracks(value);
        setLoading(false);
      },
      error: (error) => {
        setError(errorMessage(error));
        setLoading(false);
      },
    });
    return () => subscription.unsubscribe();
  }, []);
  return { tracks, loading, error };
}
