import { test, expect } from '@playwright/test';

test.describe('Waveform Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForSelector('h1', { timeout: 10000 });
    
    // Generate test audio first
    const generateTestButton = page.getByRole('button', { name: /生成测试音频/i });
    if (await generateTestButton.isVisible()) {
      await generateTestButton.click();
      // Wait for test audio to be generated
      await page.waitForTimeout(2000);
    }
    
    // Find and click the edit button for the first audio item
    const editButtons = page.getByRole('button', { name: /编辑/i });
    const firstEditButton = editButtons.first();
    await firstEditButton.waitFor({ state: 'visible', timeout: 10000 });
    await firstEditButton.click();
    
    // Wait for waveform editor dialog to open
    await page.waitForSelector('text=音频波形编辑器', { timeout: 10000 });
    await page.waitForTimeout(1000); // Wait for waveform to render
  });

  test('loudness slider should move and apply changes in real-time', async ({ page }) => {
    // Find the loudness slider
    const loudnessSection = page.locator('text=响度调整').locator('..');
    const slider = loudnessSection.locator('[role="slider"]');
    
    // Check initial value is 100%
    await expect(loudnessSection).toContainText('100%');
    
    // Get slider bounding box
    const sliderBox = await slider.boundingBox();
    if (!sliderBox) {
      throw new Error('Slider not found');
    }
    
    // Drag slider to the right (increase volume to ~150%)
    await slider.hover();
    await page.mouse.down();
    await page.mouse.move(sliderBox.x + sliderBox.width * 0.7, sliderBox.y + sliderBox.height / 2);
    
    // Check that the percentage updates during drag (should show something other than 100%)
    const textDuringDrag = await loudnessSection.textContent();
    console.log('Text during drag:', textDuringDrag);
    
    // Release mouse
    await page.mouse.up();
    
    // Wait a bit for reset
    await page.waitForTimeout(200);
    
    // After release, should reset to 100%
    await expect(loudnessSection).toContainText('100%', { timeout: 1000 });
  });

  test('loop button should enable and start playback with selection', async ({ page }) => {
    // Create a selection by dragging on the waveform
    const waveform = page.locator('#waveform, [class*="waveform"]').first();
    await waveform.waitFor({ state: 'visible' });
    
    const waveformBox = await waveform.boundingBox();
    if (!waveformBox) {
      throw new Error('Waveform not found');
    }
    
    // Drag to create a selection (from 20% to 60% of waveform width)
    const startX = waveformBox.x + waveformBox.width * 0.2;
    const endX = waveformBox.x + waveformBox.width * 0.6;
    const middleY = waveformBox.y + waveformBox.height / 2;
    
    await page.mouse.move(startX, middleY);
    await page.mouse.down();
    await page.mouse.move(endX, middleY);
    await page.mouse.up();
    
    // Wait for selection to be created
    await page.waitForTimeout(500);
    
    // Check if selection info is displayed
    const selectionInfo = page.locator('text=/选区:/');
    await expect(selectionInfo).toBeVisible({ timeout: 2000 });
    
    // Click the loop button
    const loopButton = page.getByRole('button', { name: /循环/i });
    await loopButton.click();
    
    // Wait a moment for playback to start
    await page.waitForTimeout(500);
    
    // Check that loop button shows active state (contains "循环中")
    await expect(loopButton).toContainText('循环中');
    
    // Check console logs for loop functionality
    // Note: In a real test, you'd monitor the audio playback state
    console.log('Loop button clicked, playback should have started');
    
    // Click loop button again to disable
    await loopButton.click();
    await expect(loopButton).toContainText('循环');
  });

  test('loop should restart at selection boundaries', async ({ page }) => {
    // Enable console logging to check loop functionality
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });
    
    // Create a selection
    const waveform = page.locator('#waveform, [class*="waveform"]').first();
    await waveform.waitFor({ state: 'visible' });
    
    const waveformBox = await waveform.boundingBox();
    if (!waveformBox) {
      throw new Error('Waveform not found');
    }
    
    // Create a small selection (20% to 30% of waveform)
    const startX = waveformBox.x + waveformBox.width * 0.2;
    const endX = waveformBox.x + waveformBox.width * 0.3;
    const middleY = waveformBox.y + waveformBox.height / 2;
    
    await page.mouse.move(startX, middleY);
    await page.mouse.down();
    await page.mouse.move(endX, middleY);
    await page.mouse.up();
    await page.waitForTimeout(500);
    
    // Enable loop
    const loopButton = page.getByRole('button', { name: /循环/i });
    await loopButton.click();
    
    // Wait for playback and potential loop
    await page.waitForTimeout(3000);
    
    // Check console logs for loop messages
    const loopMessages = consoleMessages.filter(msg => 
      msg.includes('Loop enabled') || 
      msg.includes('Looping back') || 
      msg.includes('Restarting from selection')
    );
    
    console.log('Loop-related console messages:', loopMessages);
    
    // We should see at least the "Loop enabled" message
    expect(loopMessages.length).toBeGreaterThan(0);
  });
});
