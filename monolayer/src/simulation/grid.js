export function getAdjustedCoordinates(x, y, HEIGHT, WIDTH, dx) {
  // Translate coordinates so (0,0) is the bottom-left corner of the grid, then round.
  let adjustedX = Math.round(-x/dx + WIDTH / 2-1);
  let adjustedY = Math.round(y/dx + HEIGHT / 2);

  // Clamp to grid bounds
  if (adjustedY <= 0) adjustedY = 0;
  if (adjustedX <= 0) adjustedX = 0;
  if (adjustedY >= HEIGHT) adjustedY = HEIGHT - 1;
  if (adjustedX >= WIDTH) adjustedX = WIDTH - 1;

  // Calculate the 1D index corresponding to the 2D grid coordinates.
  return adjustedY * WIDTH + adjustedX;
}
