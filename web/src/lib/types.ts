export type Role = 'runner' | 'hunter';
export type RoomStatus = 'lobby' | 'hiding' | 'hunt' | 'paused' | 'ended';
export type Settings = {
  hide_secs: number; tasks_per_runner: number; cooldown_secs: number; win_pct: number;
  reveal_every: number; reveal_for: number; shrink_every: number; shrink_factor: number; min_zone_m: number;
  match_secs: number; catch_radius_m: number; buffer_m: number; grace_secs: number; max_acc_m: number; curfew_at: string | null; event?: string;
};
export type Profile = {
  id: string; username: string; full_name: string; phone: string; dob: string; college: string; branch: string; year: number;
  selfie_path: string | null; is_organiser: boolean; is_owner: boolean; email: string;
  matches: number; wins: number; catches: number; tasks_done: number; times_caught: number; distance_m: number;
  badges: { code: string; at: string }[]; application: 'pending' | 'approved' | 'rejected' | null;
  friends_pending: number; invites: number;
  title: string; card_style: string; unlocks?: { titles: string[]; styles: string[] };
};
export type Member = {
  id: string; username: string; name: string; selfie: string | null; college: string; branch: string; year: number;
  status: 'pending' | 'accepted' | 'rejected' | 'left' | 'removed'; role: Role | null; alive: boolean; out_reason: string | null;
  tasks: number; catches: number; distance?: number | null; phone?: string | null; oob?: boolean | null; invite?: boolean; title?: string | null;
};
export type Pos = { id: string; lat: number; lng: number; acc: number | null; at: string; role: Role };
export type GameEvent = { id: number; kind: string; actor: string | null; target: string | null; data: any; at: string };
export type Progress = { done: number; total: number; pct: number; max_pct: number; mark: number; runners_alive: number; runners: number; hunters_alive: number };
export type RoomState = {
  now: string; is_admin: boolean;
  room: {
    id: string; code: string | null; name: string; is_public: boolean; status: RoomStatus; paused_from: RoomStatus | null;
    settings: Settings; boundary: [number, number][] | null; nogo: [number, number][][]; zone: { lat: number; lng: number; r: number } | null;
    zone_next: { lat: number; lng: number; r: number } | null; hide_ends_at: string | null; hunt_at: string | null; ends_at: string | null;
    next_shrink_at: string | null; paused_at: string | null; ended_at: string | null; winner: 'runners' | 'hunters' | 'none' | null;
    end_reason: string | null; max_players: number; admin: { id: string; username: string; name: string; selfie: string | null };
  };
  me: null | {
    status: Member['status']; role: Role | null; alive: boolean; out_reason: string | null; tasks: number; catches: number; distance: number;
    cooldown_until: string | null; task_active: boolean; oob_since: string | null; oob_reason: string | null; strikes: number; qr: string | null;
  };
  reveal: { active: boolean; until: string | null; next_at: string | null };
  progress: Progress | null;
  members: Member[];
  positions: Pos[];
  events: GameEvent[];
};
