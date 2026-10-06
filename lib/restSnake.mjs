export const BOARD_SIZE = 16;
export const DIRECTIONS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

export function placeFood(snake, random = Math.random) {
  const free = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (!snake.some(cell => same(cell, [x, y]))) free.push([x, y]);
    }
  }
  return free.length ? free[Math.floor(random() * free.length)] : null;
}

export function newSnake() {
  return { snake: [[7, 8], [6, 8], [5, 8]], direction: 'right', food: [11, 8], score: 0, status: 'playing' };
}

export function stepSnake(game, requestedDirection, random = Math.random) {
  if (game.status !== 'playing') return game;
  const previous = DIRECTIONS[game.direction];
  const requested = DIRECTIONS[requestedDirection] || previous;
  const direction = requested[0] === -previous[0] && requested[1] === -previous[1]
    ? game.direction : DIRECTIONS[requestedDirection] ? requestedDirection : game.direction;
  const delta = DIRECTIONS[direction];
  const head = [game.snake[0][0] + delta[0], game.snake[0][1] + delta[1]];
  const eating = same(head, game.food);
  const body = eating ? game.snake : game.snake.slice(0, -1);
  if (head.some(n => n < 0 || n >= BOARD_SIZE) || body.some(cell => same(cell, head))) {
    return { ...game, status: 'lost' };
  }
  const snake = [head, ...body];
  const food = eating ? placeFood(snake, random) : game.food;
  return { snake, direction, food, score: game.score + (eating ? 1 : 0), status: food ? 'playing' : 'won' };
}
