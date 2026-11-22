export type GameType = "chess" | "ludo" | "tictactoe";
export type MatchStatus = "waiting" | "active" | "completed" | "cancelled";

export interface TicTacToeState {
  gameType: "tictactoe";
  board: Array<"X" | "O" | null>;
  players: [string, string];
  symbols: Record<string, "X" | "O">;
  turn: "X" | "O";
  turnUsername: string;
  status: "active" | "completed";
  winner: "X" | "O" | "draw" | null;
  winnerUsername: string | null;
  winningLine: number[] | null;
  moveCount: number;
  lastMoveIndex: number | null;
  scores: Record<string, number> & { draws: number };
}

export type ChessColor = "w" | "b";
export type ChessPieceType = "p" | "r" | "n" | "b" | "q" | "k";

export interface ChessPiece {
  type: ChessPieceType;
  color: ChessColor;
}

export interface ChessMoveRecord {
  from: { r: number; c: number };
  to: { r: number; c: number };
  notation?: string;
  san?: string;
  piece?: ChessPieceType;
  color?: ChessColor;
  captured?: ChessPieceType | null;
  promotion?: ChessPieceType | null;
}

export interface ChessState {
  gameType: "chess";
  board: Array<Array<ChessPiece | null>>;
  players: { w: string; b: string };
  turn: ChessColor;
  turnUsername: string;
  timeMinutes: number;
  timeControlMs: number;
  clocks: { w: number; b: number };
  lastTimestamp: number;
  inCheck: boolean;
  status: "active" | "checkmate" | "stalemate" | "draw" | "resigned" | "timeout" | "completed";
  winner: string | null;
  winnerUsername: string | null;
  winnerColor: ChessColor | null;
  reason: string | null;
  lastMove: { from: { r: number; c: number }; to: { r: number; c: number } } | null;
  moveHistory: ChessMoveRecord[];
  capturedPieces: { w: ChessPieceType[]; b: ChessPieceType[] };
  pendingUndo: { requestedBy: string; target?: string } | null;
  pendingDraw: { offeredBy: string; target?: string } | null;
}

export type LudoColor = "red" | "green" | "yellow" | "blue";

export interface LudoState {
  gameType: "ludo";
  activeColors: LudoColor[];
  colorPlayers: Partial<Record<LudoColor, string>>;
  playerColors: Record<string, LudoColor>;
  tokens: Partial<Record<LudoColor, number[]>>;
  turnIndex: number;
  turnColor: LudoColor;
  turnUsername: string;
  diceValue: number | null;
  lastDiceValue: number | null;
  rollId: number;
  moveSeq: number;
  canRoll: boolean;
  mustMove: boolean;
  validTokenIndices: number[];
  lastAction?: string;
  status: "active" | "completed";
  winner: string | null;
  winnerUsername?: string | null;
  winnerColor?: LudoColor | null;
  rankings?: string[];
}

export type GameStateUnion = TicTacToeState | ChessState | LudoState | null;

export interface GameMatch {
  id: string;
  roomId: string;
  gameType: GameType;
  status: MatchStatus;
  hostUsername: string;
  players: string[];
  spectators: string[];
  options: { timeMinutes?: number; maxPlayers?: number };
  state: GameStateUnion;
  winner: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface GameInvitation {
  id: string;
  roomId: string;
  matchId: string;
  gameType: GameType;
  fromUsername: string;
  toUsername: string;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
}

export interface GamesLobbyState {
  roomId: string;
  gamesEnabled: boolean;
  owner: string;
  matches: GameMatch[];
  pendingInvites: GameInvitation[];
}
