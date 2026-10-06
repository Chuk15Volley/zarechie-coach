import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_SIZE, newSnake, placeFood, stepSnake } from '../lib/restSnake.mjs';

test('snake moves forward and rejects a reverse turn', () => {
  const next = stepSnake(newSnake(), 'left');
  assert.deepEqual(next.snake[0], [8, 8]);
  assert.equal(next.direction, 'right');
  assert.equal(next.snake.length, 3);
  assert.deepEqual(stepSnake(next, 'up').snake[0], [8, 7]);
});

test('food grows the snake and respawns on an empty cell', () => {
  const next = stepSnake({ ...newSnake(), food: [8, 8] }, 'right', () => 0);
  assert.equal(next.score, 1);
  assert.equal(next.snake.length, 4);
  assert.ok(!next.snake.some(cell => cell.toString() === next.food.toString()));
});

test('walls and body collisions end the game; moving into the departing tail is allowed', () => {
  const wall = stepSnake({ ...newSnake(), snake: [[15, 8], [14, 8]] }, 'right');
  assert.equal(wall.status, 'lost');
  assert.equal(stepSnake(wall, 'up'), wall);
  const loop = { ...newSnake(), direction: 'up', snake: [[2, 2], [2, 3], [3, 3], [3, 2], [3, 1]] };
  assert.equal(stepSnake(loop, 'right').status, 'lost');
  assert.equal(stepSnake({ ...loop, snake: loop.snake.slice(0, -1) }, 'right').status, 'playing');
});

test('filling the board wins without attempting to place more food', () => {
  const snake = [[1, 0]];
  for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) {
    if (!(y === 0 && x <= 1)) snake.push([x, y]);
  }
  const next = stepSnake({ snake, food: [0, 0], direction: 'left', score: 252, status: 'playing' }, 'left');
  assert.equal(next.status, 'won');
  assert.equal(next.food, null);
  assert.equal(placeFood(next.snake), null);
});
