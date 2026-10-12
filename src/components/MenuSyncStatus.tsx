import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMenuSyncState, MENU_SYNC_EVENT } from "../menuSync";

export function useMenuSyncState() {
  const [state, setState] = useState(getMenuSyncState);
  useEffect(() => {
    const refresh = () => setState(getMenuSyncState());
    window.addEventListener(MENU_SYNC_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(MENU_SYNC_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return state;
}

export default function MenuSyncStatus() {
  const state = useMenuSyncState();
  return (
    <div className="menu-sync-status no-print" role="status">
      {!state ? <>Customer menu is not connected. <Link to="/menu-qr">Set up online menu</Link></>
        : state.error ? <>{state.error} <Link to="/menu-qr">Menu settings</Link></>
        : state.pending || state.outbox ? "Publishing customer menu changes…"
        : "Customer menu is up to date."}
    </div>
  );
}
