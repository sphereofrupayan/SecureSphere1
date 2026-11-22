const crypto = require("crypto");

/* ═══════════════════════════════════════════════════════════════
   TIC TAC TOE ENGINE
   ═══════════════════════════════════════════════════════════════ */
const TTT_WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

const tttEngine = {
  createInitialState(players, options = {}, existingScores = null) {
    const p0 = players[0] || "Player 1";
    const p1 = players[1] || "Player 2";
    const symbols = { [p0]: "X", [p1]: "O" };
    return {
      gameType: "tictactoe",
      board: Array(9).fill(null),
      players: [p0, p1],
      symbols,
      turn: "X",
      turnUsername: p0,
      status: "active",
      winner: null,
      winnerUsername: null,
      winningLine: null,
      moveCount: 0,
      lastMoveIndex: null,
      scores: existingScores || { [p0]: 0, [p1]: 0, draws: 0 }
    };
  },

  applyMove(state, username, payload) {
    if (!state || state.status !== "active") {
      return { ok: false, error: "This Tic Tac Toe match is already finished." };
    }
    const cellIndex = Number(
      typeof payload === "object" && payload !== null ? payload.cellIndex ?? payload.index ?? payload.cell : payload
    );
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) {
      return { ok: false, error: "Invalid board cell." };
    }
    const symbol = state.symbols?.[username];
    if (!symbol) {
      return { ok: false, error: "Spectators cannot make moves." };
    }
    if (symbol !== state.turn || String(username).toLowerCase() !== String(state.turnUsername).toLowerCase()) {
      return { ok: false, error: "Wait for your turn." };
    }
    if (state.board[cellIndex] !== null) {
      return { ok: false, error: "That square is already occupied." };
    }

    state.board[cellIndex] = symbol;
    state.moveCount += 1;
    state.lastMoveIndex = cellIndex;

    let matchedLine = null;
    for (const line of TTT_WIN_LINES) {
      const [a, b, c] = line;
      if (state.board[a] && state.board[a] === state.board[b] && state.board[a] === state.board[c]) {
        matchedLine = line;
        break;
      }
    }

    if (matchedLine) {
      state.status = "completed";
      state.winner = symbol;
      state.winnerUsername = username;
      state.winningLine = matchedLine;
      state.scores[username] = (state.scores[username] || 0) + 1;
      return { ok: true, state, completed: true, winner: username };
    }

    if (state.moveCount >= 9) {
      state.status = "completed";
      state.winner = "draw";
      state.winnerUsername = null;
      state.winningLine = null;
      state.scores.draws = (state.scores.draws || 0) + 1;
      return { ok: true, state, completed: true, winner: "draw" };
    }

    state.turn = symbol === "X" ? "O" : "X";
    const nextPlayer = state.players.find(p => state.symbols[p] === state.turn) || state.players[0];
    state.turnUsername = nextPlayer;
    return { ok: true, state, completed: false };
  },

  resetForRematch(state, players) {
    const prevPlayers = Array.isArray(players) && players.length >= 2 ? players : state.players;
    // Swap starting order so previous O starts as X
    const swapped = [prevPlayers[1], prevPlayers[0]];
    const scores = state?.scores || { [prevPlayers[0]]: 0, [prevPlayers[1]]: 0, draws: 0 };
    return this.createInitialState(swapped, {}, scores);
  }
};

/* ═══════════════════════════════════════════════════════════════
   CHESS ENGINE (Full Legal FIDE-Compliant Rules)
   ═══════════════════════════════════════════════════════════════ */
const FILES = "abcdefgh";

function cloneBoard(board) {
  return board.map(row => row.map(cell => (cell ? { ...cell } : null)));
}

function createStartingChessBoard() {
  const backRank = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRank[c], color: "b" };
    board[1][c] = { type: "p", color: "b" };
    board[6][c] = { type: "p", color: "w" };
    board[7][c] = { type: backRank[c], color: "w" };
  }
  return board;
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function squareToCoord(r, c) {
  return `${FILES[c]}${8 - r}`;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === "k") return { r, c };
    }
  }
  return null;
}

function isSquareAttacked(board, targetR, targetC, attackerColor) {
  // Pawn attacks
  const pawnDir = attackerColor === "w" ? 1 : -1; // square from attacker's perspective that hits target
  for (const dc of [-1, 1]) {
    const pr = targetR + pawnDir;
    const pc = targetC + dc;
    if (inBounds(pr, pc)) {
      const p = board[pr][pc];
      if (p && p.color === attackerColor && p.type === "p") return true;
    }
  }

  // Knight attacks
  const knightOffsets = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
  ];
  for (const [dr, dc] of knightOffsets) {
    const nr = targetR + dr;
    const nc = targetC + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === attackerColor && p.type === "n") return true;
    }
  }

  // Diagonal rays (Bishop / Queen)
  const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of diagDirs) {
    let nr = targetR + dr;
    let nc = targetC + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === attackerColor && (p.type === "b" || p.type === "q")) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // Orthogonal rays (Rook / Queen)
  const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of orthoDirs) {
    let nr = targetR + dr;
    let nc = targetC + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === attackerColor && (p.type === "r" || p.type === "q")) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // Adjacent King
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = targetR + dr;
      const nc = targetC + dc;
      if (inBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p && p.color === attackerColor && p.type === "k") return true;
      }
    }
  }

  return false;
}

function isKingInCheck(board, color) {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  const enemy = color === "w" ? "b" : "w";
  return isSquareAttacked(board, kingPos.r, kingPos.c, enemy);
}

function generatePseudoLegalMoves(board, castling, enPassant, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  const color = piece.color;
  const enemy = color === "w" ? "b" : "w";

  if (piece.type === "p") {
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    const promoRow = color === "w" ? 0 : 7;

    // 1-step forward
    const r1 = r + dir;
    if (inBounds(r1, c) && !board[r1][c]) {
      moves.push({ r: r1, c, isPromotion: r1 === promoRow });
      // 2-step from initial rank
      const r2 = r + dir * 2;
      if (r === startRow && inBounds(r2, c) && !board[r2][c]) {
        moves.push({ r: r2, c, isDoubleStep: true });
      }
    }

    // Diagonal captures & en passant
    for (const dc of [-1, 1]) {
      const nc = c + dc;
      if (!inBounds(r1, nc)) continue;
      const target = board[r1][nc];
      if (target && target.color === enemy) {
        moves.push({ r: r1, c: nc, isPromotion: r1 === promoRow });
      } else if (enPassant && enPassant.r === r1 && enPassant.c === nc) {
        const adj = board[r][nc];
        if (adj && adj.color === enemy && adj.type === "p") {
          moves.push({ r: r1, c: nc, isEnPassant: true });
        }
      }
    }
  } else if (piece.type === "n") {
    const offsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (const [dr, dc] of offsets) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      if (!board[nr][nc] || board[nr][nc].color === enemy) {
        moves.push({ r: nr, c: nc });
      }
    }
  } else if (piece.type === "b" || piece.type === "r" || piece.type === "q") {
    const dirs = [];
    if (piece.type === "b" || piece.type === "q") {
      dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }
    if (piece.type === "r" || piece.type === "q") {
      dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!target) {
          moves.push({ r: nr, c: nc });
        } else {
          if (target.color === enemy) moves.push({ r: nr, c: nc });
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  } else if (piece.type === "k") {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        if (!board[nr][nc] || board[nr][nc].color === enemy) {
          moves.push({ r: nr, c: nc });
        }
      }
    }

    // Castling
    const homeRow = color === "w" ? 7 : 0;
    if (r === homeRow && c === 4 && !isKingInCheck(board, color)) {
      const kRight = color === "w" ? castling.wK : castling.bK;
      const qRight = color === "w" ? castling.wQ : castling.bQ;

      // Kingside
      const kRook = board[homeRow][7];
      if (
        kRight &&
        kRook &&
        kRook.color === color &&
        kRook.type === "r" &&
        !board[homeRow][5] &&
        !board[homeRow][6] &&
        !isSquareAttacked(board, homeRow, 5, enemy) &&
        !isSquareAttacked(board, homeRow, 6, enemy)
      ) {
        moves.push({ r: homeRow, c: 6, isCastling: "K" });
      }

      // Queenside
      const qRook = board[homeRow][0];
      if (
        qRight &&
        qRook &&
        qRook.color === color &&
        qRook.type === "r" &&
        !board[homeRow][1] &&
        !board[homeRow][2] &&
        !board[homeRow][3] &&
        !isSquareAttacked(board, homeRow, 3, enemy) &&
        !isSquareAttacked(board, homeRow, 2, enemy)
      ) {
        moves.push({ r: homeRow, c: 2, isCastling: "Q" });
      }
    }
  }

  return moves;
}

function simulateBoardMove(board, fromR, fromC, move) {
  const next = cloneBoard(board);
  const piece = next[fromR][fromC];
  next[fromR][fromC] = null;

  if (move.isEnPassant) {
    next[fromR][move.c] = null;
  }

  if (move.isCastling === "K") {
    next[fromR][5] = next[fromR][7];
    next[fromR][7] = null;
  } else if (move.isCastling === "Q") {
    next[fromR][3] = next[fromR][0];
    next[fromR][0] = null;
  }

  next[move.r][move.c] = { ...piece };
  if (move.isPromotion) {
    next[move.r][move.c].type = "q";
  }
  return next;
}

function getLegalMovesForSquare(board, castling, enPassant, r, c) {
  const piece = board[r]?.[c];
  if (!piece) return [];
  const pseudo = generatePseudoLegalMoves(board, castling, enPassant, r, c);
  return pseudo.filter(move => {
    const sim = simulateBoardMove(board, r, c, move);
    return !isKingInCheck(sim, piece.color);
  });
}

function hasAnyLegalMoves(board, castling, enPassant, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color) {
        if (getLegalMovesForSquare(board, castling, enPassant, r, c).length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

function isInsufficientMaterial(board) {
  const pieces = { w: [], b: [] };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.type === "k") continue;
      pieces[p.color].push({ type: p.type, squareColor: (r + c) % 2 });
    }
  }
  const wCount = pieces.w.length;
  const bCount = pieces.b.length;
  if (wCount === 0 && bCount === 0) return true;
  if (wCount === 1 && bCount === 0 && ["b", "n"].includes(pieces.w[0].type)) return true;
  if (bCount === 1 && wCount === 0 && ["b", "n"].includes(pieces.b[0].type)) return true;
  if (
    wCount === 1 &&
    bCount === 1 &&
    pieces.w[0].type === "b" &&
    pieces.b[0].type === "b" &&
    pieces.w[0].squareColor === pieces.b[0].squareColor
  ) {
    return true;
  }
  return false;
}

function formatChessSan({ boardBefore, piece, fromR, fromC, move, captured, promotion, castling, enPassant, inCheck, isCheckmate }) {
  if (move.isCastling === "K") {
    return `O-O${isCheckmate ? "#" : inCheck ? "+" : ""}`;
  }
  if (move.isCastling === "Q") {
    return `O-O-O${isCheckmate ? "#" : inCheck ? "+" : ""}`;
  }

  let san = "";
  const dest = squareToCoord(move.r, move.c);
  if (piece.type === "p") {
    if (captured || move.isEnPassant) {
      san += `${FILES[fromC]}x`;
    }
    san += dest;
    if (move.isPromotion && promotion) {
      san += `=${promotion.toUpperCase()}`;
    }
  } else {
    san += piece.type.toUpperCase();
    // Disambiguation
    let sameFile = false;
    let sameRank = false;
    let otherExists = false;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === fromR && c === fromC) continue;
        const p = boardBefore[r][c];
        if (p && p.color === piece.color && p.type === piece.type) {
          const legal = getLegalMovesForSquare(boardBefore, castling, enPassant, r, c);
          if (legal.some(m => m.r === move.r && m.c === move.c)) {
            otherExists = true;
            if (c === fromC) sameFile = true;
            if (r === fromR) sameRank = true;
          }
        }
      }
    }
    if (otherExists) {
      if (!sameFile) san += FILES[fromC];
      else if (!sameRank) san += String(8 - fromR);
      else san += `${FILES[fromC]}${8 - fromR}`;
    }
    if (captured) san += "x";
    san += dest;
  }

  if (isCheckmate) san += "#";
  else if (inCheck) san += "+";
  return san;
}

const chessEngine = {
  createInitialState(players, options = {}) {
    const whitePlayer = players[0] || "White";
    const blackPlayer = players[1] || "Black";
    const minutes = Math.min(60, Math.max(1, Number(options?.timeMinutes) || 10));
    const timeControlMs = minutes * 60 * 1000;
    return {
      gameType: "chess",
      board: createStartingChessBoard(),
      players: { w: whitePlayer, b: blackPlayer },
      turn: "w",
      turnUsername: whitePlayer,
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null,
      halfMoveClock: 0,
      fullMoveNumber: 1,
      timeMinutes: minutes,
      timeControlMs,
      clocks: { w: timeControlMs, b: timeControlMs },
      lastTimestamp: Date.now(),
      inCheck: false,
      status: "active",
      winner: null,
      winnerUsername: null,
      winnerColor: null,
      reason: null,
      lastMove: null,
      moveHistory: [],
      capturedPieces: { w: [], b: [] }, // pieces captured BY w / b
      snapshots: [],
      pendingUndo: null,
      pendingDraw: null
    };
  },

  reconcileClocks(state, now = Date.now()) {
    if (!state || state.status !== "active") return state;
    const elapsed = Math.max(0, now - (state.lastTimestamp || now));
    // Deduct clock only once White has played the opening move so opening doesn't drain on load
    if (state.moveHistory && state.moveHistory.length > 0) {
      state.clocks[state.turn] = Math.max(0, state.clocks[state.turn] - elapsed);
    }
    state.lastTimestamp = now;
    if (state.clocks[state.turn] <= 0) {
      const winnerColor = state.turn === "w" ? "b" : "w";
      const winnerUsername = state.players[winnerColor];
      state.status = "timeout";
      state.winner = winnerUsername;
      state.winnerUsername = winnerUsername;
      state.winnerColor = winnerColor;
      state.reason = `${state.players[state.turn]} ran out of time`;
    }
    return state;
  },

  applyMove(state, username, payload) {
    if (!state || state.status !== "active") {
      return { ok: false, error: "This Chess game has already ended." };
    }
    const now = Date.now();
    this.reconcileClocks(state, now);
    if (state.status !== "active") {
      return { ok: true, state, completed: true, winner: state.winnerUsername };
    }

    const expectedPlayer = state.players?.[state.turn];
    if (
      String(username).toLowerCase() !== String(state.players.w).toLowerCase() &&
      String(username).toLowerCase() !== String(state.players.b).toLowerCase()
    ) {
      return { ok: false, error: "Spectators cannot make chess moves." };
    }
    if (String(username).toLowerCase() !== String(expectedPlayer).toLowerCase()) {
      return { ok: false, error: `It is ${expectedPlayer}'s turn (${state.turn === "w" ? "White" : "Black"}).` };
    }

    const fromR = Number(payload?.from?.r);
    const fromC = Number(payload?.from?.c);
    const toR = Number(payload?.to?.r);
    const toC = Number(payload?.to?.c);
    if (
      !Number.isInteger(fromR) || !Number.isInteger(fromC) ||
      !Number.isInteger(toR) || !Number.isInteger(toC) ||
      !inBounds(fromR, fromC) || !inBounds(toR, toC)
    ) {
      return { ok: false, error: "Invalid board coordinates." };
    }

    const piece = state.board[fromR][fromC];
    if (!piece || piece.color !== state.turn) {
      return { ok: false, error: "Select one of your own pieces to move." };
    }

    const legalMoves = getLegalMovesForSquare(state.board, state.castling, state.enPassant, fromR, fromC);
    const matchedMove = legalMoves.find(m => m.r === toR && m.c === toC);
    if (!matchedMove) {
      return { ok: false, error: "Illegal chess move." };
    }

    let promoType = null;
    if (matchedMove.isPromotion) {
      const requested = String(payload?.promotion || "q").toLowerCase();
      promoType = ["q", "r", "b", "n"].includes(requested) ? requested : "q";
    }

    // Save Undo snapshot before mutating
    const snapshot = {
      board: cloneBoard(state.board),
      turn: state.turn,
      turnUsername: state.turnUsername,
      castling: { ...state.castling },
      enPassant: state.enPassant ? { ...state.enPassant } : null,
      halfMoveClock: state.halfMoveClock,
      fullMoveNumber: state.fullMoveNumber,
      inCheck: state.inCheck,
      lastMove: state.lastMove ? JSON.parse(JSON.stringify(state.lastMove)) : null,
      capturedPieces: {
        w: [...state.capturedPieces.w],
        b: [...state.capturedPieces.b]
      }
    };
    state.snapshots = Array.isArray(state.snapshots) ? state.snapshots : [];
    state.snapshots.push(snapshot);
    if (state.snapshots.length > 40) state.snapshots.shift();

    const boardBefore = cloneBoard(state.board);
    const prevCastling = { ...state.castling };
    const prevEnPassant = state.enPassant ? { ...state.enPassant } : null;

    let capturedPiece = state.board[toR][toC] ? { ...state.board[toR][toC] } : null;

    // Apply move to board
    state.board[fromR][fromC] = null;
    if (matchedMove.isEnPassant) {
      capturedPiece = { ...state.board[fromR][toC] };
      state.board[fromR][toC] = null;
    }

    if (matchedMove.isCastling === "K") {
      state.board[fromR][5] = state.board[fromR][7];
      state.board[fromR][7] = null;
    } else if (matchedMove.isCastling === "Q") {
      state.board[fromR][3] = state.board[fromR][0];
      state.board[fromR][0] = null;
    }

    const placedPiece = {
      type: promoType || piece.type,
      color: piece.color
    };
    state.board[toR][toC] = placedPiece;

    if (capturedPiece) {
      state.capturedPieces[piece.color].push(capturedPiece.type);
    }

    // Update castling rights
    if (piece.type === "k") {
      if (piece.color === "w") {
        state.castling.wK = false;
        state.castling.wQ = false;
      } else {
        state.castling.bK = false;
        state.castling.bQ = false;
      }
    }
    if (piece.type === "r") {
      if (fromR === 7 && fromC === 7) state.castling.wK = false;
      if (fromR === 7 && fromC === 0) state.castling.wQ = false;
      if (fromR === 0 && fromC === 7) state.castling.bK = false;
      if (fromR === 0 && fromC === 0) state.castling.bQ = false;
    }
    if (capturedPiece && capturedPiece.type === "r") {
      if (toR === 7 && toC === 7) state.castling.wK = false;
      if (toR === 7 && toC === 0) state.castling.wQ = false;
      if (toR === 0 && toC === 7) state.castling.bK = false;
      if (toR === 0 && toC === 0) state.castling.bQ = false;
    }

    // Update enPassant target
    state.enPassant = matchedMove.isDoubleStep
      ? { r: (fromR + toR) / 2, c: toC }
      : null;

    // Clocks & counters
    if (piece.type === "p" || capturedPiece) state.halfMoveClock = 0;
    else state.halfMoveClock += 1;
    if (piece.color === "b") state.fullMoveNumber += 1;

    const nextColor = piece.color === "w" ? "b" : "w";
    const nextInCheck = isKingInCheck(state.board, nextColor);
    const nextHasMoves = hasAnyLegalMoves(state.board, state.castling, state.enPassant, nextColor);
    const isCheckmate = !nextHasMoves && nextInCheck;

    const san = formatChessSan({
      boardBefore,
      piece,
      fromR,
      fromC,
      move: matchedMove,
      captured: Boolean(capturedPiece),
      promotion: promoType,
      castling: prevCastling,
      enPassant: prevEnPassant,
      inCheck: nextInCheck,
      isCheckmate
    });

    state.turn = nextColor;
    state.turnUsername = state.players[nextColor];
    state.inCheck = nextInCheck;
    state.pendingUndo = null;
    state.pendingDraw = null;
    state.lastMove = {
      from: { r: fromR, c: fromC },
      to: { r: toR, c: toC },
      piece: piece.type,
      color: piece.color,
      captured: capturedPiece ? capturedPiece.type : null,
      promotion: promoType,
      isCastling: matchedMove.isCastling || null,
      isEnPassant: Boolean(matchedMove.isEnPassant),
      san
    };
    state.moveHistory.push({
      ply: state.moveHistory.length + 1,
      color: piece.color,
      username,
      san,
      from: squareToCoord(fromR, fromC),
      to: squareToCoord(toR, toC),
      timestamp: now
    });

    if (isCheckmate) {
      state.status = "checkmate";
      state.winner = state.players[piece.color];
      state.winnerUsername = state.players[piece.color];
      state.winnerColor = piece.color;
      state.reason = `Checkmate by ${state.players[piece.color]}`;
    } else if (!nextHasMoves && !nextInCheck) {
      state.status = "stalemate";
      state.winner = "draw";
      state.winnerUsername = null;
      state.reason = "Draw by stalemate";
    } else if (isInsufficientMaterial(state.board)) {
      state.status = "draw";
      state.winner = "draw";
      state.winnerUsername = null;
      state.reason = "Draw by insufficient material";
    } else if (state.halfMoveClock >= 100) {
      state.status = "draw";
      state.winner = "draw";
      state.winnerUsername = null;
      state.reason = "Draw by 50-move rule";
    }

    return {
      ok: true,
      state,
      completed: state.status !== "active",
      winner: state.winner
    };
  },

  handleAction(state, username, action, payload = {}) {
    if (!state) return { ok: false, error: "Game state missing." };
    const isWhite = String(username).toLowerCase() === String(state.players.w).toLowerCase();
    const isBlack = String(username).toLowerCase() === String(state.players.b).toLowerCase();
    if (!isWhite && !isBlack) {
      return { ok: false, error: "Only active match players can perform this action." };
    }

    if (action === "claimTimeout") {
      if (state.status !== "active") return { ok: true, state, completed: true };
      this.reconcileClocks(state, Date.now());
      return { ok: true, state, completed: state.status !== "active" };
    }

    if (state.status !== "active") {
      return { ok: false, error: "Match is already completed." };
    }

    if (action === "resign") {
      const winnerColor = isWhite ? "b" : "w";
      const winnerUsername = state.players[winnerColor];
      state.status = "resigned";
      state.winner = winnerUsername;
      state.winnerUsername = winnerUsername;
      state.winnerColor = winnerColor;
      state.reason = `${username} resigned`;
      state.pendingUndo = null;
      state.pendingDraw = null;
      return { ok: true, state, completed: true, winner: winnerUsername };
    }

    if (action === "offerDraw") {
      state.pendingDraw = { fromUsername: username };
      return { ok: true, state, completed: false };
    }

    if (action === "respondDraw") {
      if (!state.pendingDraw) {
        return { ok: false, error: "No pending draw offer." };
      }
      if (String(state.pendingDraw.fromUsername).toLowerCase() === String(username).toLowerCase()) {
        return { ok: false, error: "Your opponent must respond to the draw offer." };
      }
      if (payload?.accept) {
        state.status = "draw";
        state.winner = "draw";
        state.winnerUsername = null;
        state.reason = "Draw agreed by both players";
        state.pendingDraw = null;
        return { ok: true, state, completed: true, winner: "draw" };
      }
      state.pendingDraw = null;
      return { ok: true, state, completed: false };
    }

    if (action === "requestUndo") {
      if (!state.snapshots || !state.snapshots.length) {
        return { ok: false, error: "No moves available to undo." };
      }
      state.pendingUndo = { fromUsername: username };
      return { ok: true, state, completed: false };
    }

    if (action === "respondUndo") {
      if (!state.pendingUndo) {
        return { ok: false, error: "No pending undo request." };
      }
      if (String(state.pendingUndo.fromUsername).toLowerCase() === String(username).toLowerCase()) {
        return { ok: false, error: "Your opponent must approve the undo request." };
      }
      if (payload?.accept && state.snapshots && state.snapshots.length) {
        const snap = state.snapshots.pop();
        state.board = snap.board;
        state.turn = snap.turn;
        state.turnUsername = snap.turnUsername;
        state.castling = snap.castling;
        state.enPassant = snap.enPassant;
        state.halfMoveClock = snap.halfMoveClock;
        state.fullMoveNumber = snap.fullMoveNumber;
        state.inCheck = snap.inCheck;
        state.lastMove = snap.lastMove;
        state.capturedPieces = snap.capturedPieces;
        state.moveHistory.pop();
        state.lastTimestamp = Date.now();
      }
      state.pendingUndo = null;
      return { ok: true, state, completed: false };
    }

    return { ok: false, error: "Unknown chess action." };
  },

  sanitizeForClient(state) {
    if (!state) return null;
    const { snapshots, ...rest } = state;
    return {
      ...rest,
      canUndo: Array.isArray(snapshots) && snapshots.length > 0
    };
  },

  resetForRematch(state, players, options = {}) {
    const w = state?.players?.b || players[1];
    const b = state?.players?.w || players[0];
    return this.createInitialState([w, b], {
      timeMinutes: options?.timeMinutes || state?.timeMinutes || 10
    });
  }
};

/* ═══════════════════════════════════════════════════════════════
   LUDO ENGINE (2–4 Players, 15x15 Classic Track, Safe Stars & Captures)
   ═══════════════════════════════════════════════════════════════ */
const LUDO_COLOR_ORDER = ["red", "green", "yellow", "blue"];
const LUDO_START_OFFSET = { red: 0, green: 13, yellow: 26, blue: 39 };
const LUDO_SAFE_GLOBAL_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function getValidLudoTokens(tokenSteps, diceValue) {
  const valid = [];
  for (let i = 0; i < tokenSteps.length; i++) {
    const step = tokenSteps[i];
    if (step === -1 && diceValue === 6) {
      valid.push(i);
    } else if (step >= 0 && step < 56 && step + diceValue <= 56) {
      valid.push(i);
    }
  }
  return valid;
}

function advanceLudoTurn(state) {
  const count = state.activeColors.length;
  for (let offset = 1; offset <= count; offset++) {
    const candidateIdx = (state.turnIndex + offset) % count;
    const candidateColor = state.activeColors[candidateIdx];
    const allDone = state.tokens[candidateColor].every(s => s === 56);
    if (!allDone) {
      state.turnIndex = candidateIdx;
      state.turnColor = candidateColor;
      state.turnUsername = state.colorPlayers[candidateColor];
      state.canRoll = true;
      state.mustMove = false;
      state.diceValue = null;
      state.validTokenIndices = [];
      state.consecutiveSixes = 0;
      return;
    }
  }
}

const ludoEngine = {
  START_OFFSET: LUDO_START_OFFSET,
  SAFE_INDICES: Array.from(LUDO_SAFE_GLOBAL_INDICES),

  createInitialState(players, options = {}) {
    const cleanPlayers = (Array.isArray(players) ? players : []).slice(0, 4);
    let activeColors;
    if (cleanPlayers.length === 2) {
      activeColors = ["red", "yellow"]; // Opposite corners for 2-player balance
    } else if (cleanPlayers.length === 3) {
      activeColors = ["red", "green", "yellow"];
    } else {
      activeColors = ["red", "green", "yellow", "blue"];
    }

    const colorPlayers = {};
    const playerColors = {};
    const tokens = {};
    activeColors.forEach((col, idx) => {
      const uname = cleanPlayers[idx] || `Player ${idx + 1}`;
      colorPlayers[col] = uname;
      playerColors[uname] = col;
      tokens[col] = [-1, -1, -1, -1];
    });

    const firstColor = activeColors[0];
    return {
      gameType: "ludo",
      activeColors,
      colorPlayers,
      playerColors,
      tokens,
      turnIndex: 0,
      turnColor: firstColor,
      turnUsername: colorPlayers[firstColor],
      diceValue: null,
      lastDiceValue: null,
      rollId: 0,
      moveSeq: 0,
      lastRoll: null,
      lastMove: null,
      canRoll: true,
      mustMove: false,
      validTokenIndices: [],
      consecutiveSixes: 0,
      rankings: [],
      status: "active",
      winner: null,
      winnerUsername: null,
      lastAction: `${colorPlayers[firstColor]}'s turn — Roll the dice!`,
      lastCapture: null
    };
  },

  rollDice(state, username) {
    if (!state || state.status !== "active") {
      return { ok: false, error: "This Ludo match has already ended." };
    }
    if (!state.playerColors?.[username]) {
      return { ok: false, error: "Spectators cannot roll the dice." };
    }
    if (String(username).toLowerCase() !== String(state.turnUsername).toLowerCase()) {
      return { ok: false, error: `Wait for ${state.turnUsername} to finish their turn.` };
    }
    if (!state.canRoll) {
      return { ok: false, error: "Select a highlighted token to move before rolling again." };
    }

    const dice = crypto.randomInt(1, 7);
    const color = state.turnColor;
    state.rollId = (state.rollId || 0) + 1;
    state.diceValue = dice;
    state.lastDiceValue = dice;
    state.lastCapture = null;
    state.lastRoll = {
      rollId: state.rollId,
      username,
      color,
      dice,
      autoPassed: false,
      tripleSix: false,
      timestamp: Date.now()
    };

    if (dice === 6) {
      state.consecutiveSixes = (state.consecutiveSixes || 0) + 1;
      if (state.consecutiveSixes >= 3) {
        const prevUser = username;
        advanceLudoTurn(state);
        state.lastDiceValue = dice;
        state.lastRoll.autoPassed = true;
        state.lastRoll.tripleSix = true;
        state.lastAction = `${prevUser} rolled three 6s in a row — turn passes to ${state.turnUsername}!`;
        return { ok: true, state, dice, autoPassed: true };
      }
    } else {
      state.consecutiveSixes = 0;
    }

    const valid = getValidLudoTokens(state.tokens[color], dice);
    state.validTokenIndices = valid;

    if (valid.length === 0) {
      const prevUser = username;
      advanceLudoTurn(state);
      state.lastDiceValue = dice;
      state.lastRoll.autoPassed = true;
      state.lastAction = `${prevUser} rolled ${dice} with no legal moves — ${state.turnUsername}'s turn.`;
      return { ok: true, state, dice, autoPassed: true };
    }

    state.canRoll = false;
    state.mustMove = true;
    state.lastAction = `${username} rolled ${dice}! Choose a highlighted token to move.`;
    return { ok: true, state, dice, autoPassed: false };
  },

  moveToken(state, username, payload) {
    if (!state || state.status !== "active") {
      return { ok: false, error: "This Ludo match has already ended." };
    }
    if (!state.playerColors?.[username]) {
      return { ok: false, error: "Spectators cannot move tokens." };
    }
    if (String(username).toLowerCase() !== String(state.turnUsername).toLowerCase()) {
      return { ok: false, error: "It is not your turn." };
    }
    if (!state.mustMove || !state.diceValue) {
      return { ok: false, error: "Roll the dice first." };
    }

    const tokenIndex = Number(
      typeof payload === "object" && payload !== null ? payload.tokenIndex ?? payload.index : payload
    );
    if (!Number.isInteger(tokenIndex) || !state.validTokenIndices.includes(tokenIndex)) {
      return { ok: false, error: "Choose one of the valid highlighted tokens." };
    }

    const color = state.turnColor;
    const prevStep = state.tokens[color][tokenIndex];
    const dice = state.diceValue;
    const newStep = prevStep === -1 ? 0 : prevStep + dice;
    state.tokens[color][tokenIndex] = newStep;

    let capturedInfo = null;
    const capturedList = [];
    if (newStep >= 0 && newStep <= 50) {
      const globalIdx = (LUDO_START_OFFSET[color] + newStep) % 52;
      if (!LUDO_SAFE_GLOBAL_INDICES.has(globalIdx)) {
        for (const oppColor of state.activeColors) {
          if (oppColor === color) continue;
          const oppTokens = state.tokens[oppColor];
          for (let i = 0; i < oppTokens.length; i++) {
            const oppStep = oppTokens[i];
            if (oppStep >= 0 && oppStep <= 50) {
              const oppGlobal = (LUDO_START_OFFSET[oppColor] + oppStep) % 52;
              if (oppGlobal === globalIdx) {
                oppTokens[i] = -1; // Capture back to yard!
                capturedList.push({
                  victim: state.colorPlayers[oppColor],
                  victimColor: oppColor,
                  tokenIndex: i,
                  fromStep: oppStep
                });
                if (!capturedInfo) {
                  capturedInfo = {
                    by: username,
                    byColor: color,
                    victim: state.colorPlayers[oppColor],
                    victimColor: oppColor,
                    capturedTokens: capturedList
                  };
                }
              }
            }
          }
        }
      }
    }

    const reachedHome = newStep === 56;
    const finishedAll = state.tokens[color].every(s => s === 56);
    if (finishedAll && !state.rankings.includes(username)) {
      state.rankings.push(username);
    }

    state.moveSeq = (state.moveSeq || 0) + 1;
    const earnsBonusRoll = !finishedAll && (dice === 6 || Boolean(capturedInfo) || reachedHome);
    state.lastCapture = capturedInfo;
    state.lastMove = {
      moveId: state.moveSeq,
      username,
      color,
      tokenIndex,
      fromStep: prevStep,
      toStep: newStep,
      dice,
      captured: capturedInfo,
      reachedHome,
      earnsBonusRoll,
      timestamp: Date.now()
    };

    // Check game completion
    const finishedThreshold = Math.max(1, state.activeColors.length - 1);
    if (state.rankings.length >= finishedThreshold) {
      const remaining = state.activeColors
        .map(col => state.colorPlayers[col])
        .filter(u => !state.rankings.includes(u));
      state.rankings.push(...remaining);
      state.status = "completed";
      state.winner = state.rankings[0];
      state.winnerUsername = state.rankings[0];
      state.canRoll = false;
      state.mustMove = false;
      state.diceValue = null;
      state.validTokenIndices = [];
      state.lastAction = `${state.rankings[0]} wins the Ludo match!`;
      return { ok: true, state, completed: true, winner: state.rankings[0], capturedInfo };
    }

    if (earnsBonusRoll) {
      state.canRoll = true;
      state.mustMove = false;
      state.diceValue = null;
      state.validTokenIndices = [];
      const reason = capturedInfo
        ? `captured ${capturedInfo.victim}'s token`
        : reachedHome
        ? "reached Home"
        : "rolled a 6";
      state.lastAction = `${username} ${reason} — bonus roll!`;
    } else {
      const actionActor = username;
      const movedText = prevStep === -1 ? "entered a token" : `moved ${dice}`;
      advanceLudoTurn(state);
      state.lastAction = `${actionActor} ${movedText}. ${state.turnUsername}'s turn.`;
    }

    return { ok: true, state, completed: false, capturedInfo };
  },

  resetForRematch(state, players) {
    const basePlayers = Array.isArray(players) && players.length >= 2
      ? players
      : state.activeColors.map(c => state.colorPlayers[c]);
    const rotated = basePlayers.length > 1 ? [...basePlayers.slice(1), basePlayers[0]] : basePlayers;
    return this.createInitialState(rotated);
  }
};

module.exports = {
  tttEngine,
  chessEngine,
  ludoEngine,
  LUDO_COLOR_ORDER,
  LUDO_START_OFFSET,
  LUDO_SAFE_GLOBAL_INDICES,
  getLegalMovesForSquare
};
