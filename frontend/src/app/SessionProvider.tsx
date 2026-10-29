import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { SessionController } from "../features/session/SessionController";
const Context = createContext<SessionController | null>(null);
export function SessionProvider({ children }: PropsWithChildren) {
  const [controller] = useState(
    () => new SessionController(location.pathname === "/phone"),
  );
  useEffect(() => {
    const stop = () => controller.dispose();
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      controller.dispose();
    };
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useSession() {
  const controller = useContext(Context);
  if (!controller) throw new Error("SessionProvider가 필요합니다");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  return { state, controller };
}
