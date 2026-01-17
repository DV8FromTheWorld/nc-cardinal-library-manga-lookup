# iOS Simulator Automation Guide

This document explains how to programmatically interact with the iOS Simulator on macOS, including clicking buttons, taking screenshots, and coordinate mapping.

## Prerequisites

- **cliclick**: Command-line tool for clicking at screen coordinates
  ```bash
  brew install cliclick
  ```
- **Xcode Command Line Tools**: Provides `xcrun simctl`

## Key Concepts

### Coordinate Systems

There are multiple coordinate systems to understand:

1. **Physical Display Pixels**: The actual pixels on your Mac display (e.g., 3456 x 2234 for a Retina MacBook Pro)

2. **Logical Screen Points**: Physical pixels divided by scale factor. A 2x Retina display has half the logical points as physical pixels (e.g., 1728 x 1117)

3. **Device Pixels**: The iOS device's simulated resolution (e.g., iPhone 16 Pro = 1206 x 2622 at 3x scale)

4. **Device Logical Points**: Device pixels divided by device scale (e.g., 402 x 874 for iPhone 16 Pro)

**Important**: `cliclick` uses **logical screen points**, not physical pixels.

### Window-Relative Positioning

The simplest approach is to calculate click positions as **percentages of the simulator window**:

```bash
screen_x = window_x + (window_width × X_percentage)
screen_y = window_y + (window_height × Y_percentage)
```

This avoids complex device-pixel-to-screen-coordinate mapping.

## Common Commands

### Check Running Simulators

```bash
xcrun simctl list devices | grep -i booted
# Output: iPhone 16 Pro (FD59EC9D-C72D-4946-A1AB-ADFDE61F52AD) (Booted)
```

### Get Simulator Window Position and Size

```bash
osascript -e 'tell application "System Events" to tell process "Simulator" to get position of window 1'
# Output: 364, 117

osascript -e 'tell application "System Events" to tell process "Simulator" to get size of window 1'
# Output: 456, 972
```

Or combined:

```bash
osascript -e 'tell application "System Events"
    tell process "Simulator"
        set {winX, winY} to position of window 1
        set {winW, winH} to size of window 1
        return "Position: " & winX & "," & winY & " Size: " & winW & "x" & winH
    end tell
end tell'
```

### Take Screenshot

```bash
xcrun simctl io booted screenshot /tmp/screenshot.png
```

### Record Video

```bash
# Start recording in background
xcrun simctl io booted recordVideo /tmp/video.mp4 &
VIDEO_PID=$!

# ... do your interactions ...

# IMPORTANT: Stop with SIGINT (not SIGTERM/kill)
# This allows simctl to write the moov atom (metadata)
kill -INT $VIDEO_PID

# Wait for file to be finalized
sleep 2
```

**⚠️ Critical:** Always use `kill -INT` (SIGINT) to stop recording, NOT `kill` (SIGTERM).
- SIGTERM (`kill $PID`) terminates immediately without writing metadata
- SIGINT (`kill -INT $PID`) triggers graceful shutdown, writing the `moov` atom
- Without the `moov` atom, the MP4 file will be unplayable

You should see this output when stopping correctly:
```
Recording completed. Writing to disk.
Wrote video to: /tmp/video.mp4
```

### Click at Coordinates

```bash
# Bring simulator to front first
osascript -e 'tell application "Simulator" to activate'
sleep 0.3

# Click at screen coordinates (logical points)
cliclick c:615,700
```

### Get Current Mouse Position

```bash
cliclick p:.
# Output: 580,300
```

## Calculating Click Coordinates

### Step-by-Step Process

1. **Get window info:**
   ```bash
   # Get position and size
   osascript -e 'tell application "System Events" to tell process "Simulator" to get position of window 1'
   # Example: 364, 117
   
   osascript -e 'tell application "System Events" to tell process "Simulator" to get size of window 1'
   # Example: 456, 972
   ```

2. **Take a screenshot to identify target:**
   ```bash
   xcrun simctl io booted screenshot /tmp/target.png
   ```

3. **Estimate target position as percentage of window:**
   - Look at where the element appears in the screenshot
   - Estimate X% (0 = left edge, 100% = right edge)
   - Estimate Y% (0 = top edge, 100% = bottom edge)

4. **Calculate screen coordinates:**
   ```bash
   # Example: Element at 55% across, 60% down
   # Window at (364, 117) with size (456, 972)
   
   screen_x = 364 + (456 * 0.55) = 615
   screen_y = 117 + (972 * 0.60) = 700
   ```

5. **Click and verify:**
   ```bash
   osascript -e 'tell application "Simulator" to activate'
   sleep 0.3
   cliclick c:615,700
   
   # Take screenshot to verify result
   sleep 0.5
   xcrun simctl io booted screenshot /tmp/after-click.png
   ```

### Example: Common Element Positions

Based on a standard simulator window (456 x 972):

| Element Location | X% | Y% | Example Coords (364,117 window) |
|-----------------|----|----|--------------------------------|
| Top-left | 15% | 15% | (432, 263) |
| Top-right | 85% | 15% | (752, 263) |
| Center | 50% | 50% | (592, 603) |
| Modal "Done" button | 85% | 52% | (752, 622) |
| Search suggestions | 55% | 60% | (615, 700) |

## Complete Example Script

```bash
#!/bin/bash

# iOS Simulator Click Script

# 1. Verify simulator is running
BOOTED=$(xcrun simctl list devices | grep -i booted)
if [ -z "$BOOTED" ]; then
    echo "No simulator booted"
    exit 1
fi
echo "Found: $BOOTED"

# 2. Get window position and size
POSITION=$(osascript -e 'tell application "System Events" to tell process "Simulator" to get position of window 1')
SIZE=$(osascript -e 'tell application "System Events" to tell process "Simulator" to get size of window 1')

# Parse values (format: "X, Y")
WIN_X=$(echo $POSITION | cut -d',' -f1 | tr -d ' ')
WIN_Y=$(echo $POSITION | cut -d',' -f2 | tr -d ' ')
WIN_W=$(echo $SIZE | cut -d',' -f1 | tr -d ' ')
WIN_H=$(echo $SIZE | cut -d',' -f2 | tr -d ' ')

echo "Window: position ($WIN_X, $WIN_Y), size ($WIN_W x $WIN_H)"

# 3. Calculate click position (example: 55% across, 60% down)
X_PCT=0.55
Y_PCT=0.60
CLICK_X=$(echo "$WIN_X + $WIN_W * $X_PCT" | bc | cut -d'.' -f1)
CLICK_Y=$(echo "$WIN_Y + $WIN_H * $Y_PCT" | bc | cut -d'.' -f1)

echo "Clicking at ($CLICK_X, $CLICK_Y)"

# 4. Bring simulator to front and click
osascript -e 'tell application "Simulator" to activate'
sleep 0.3
cliclick c:$CLICK_X,$CLICK_Y

# 5. Take screenshot to verify
sleep 0.5
xcrun simctl io booted screenshot /tmp/click-result.png
echo "Screenshot saved to /tmp/click-result.png"
```

## Troubleshooting

### Clicks Not Registering

1. **Check window is frontmost:**
   ```bash
   osascript -e 'tell application "Simulator" to activate'
   ```

2. **Verify coordinates are within window bounds:**
   - Click X should be between `window_x` and `window_x + window_width`
   - Click Y should be between `window_y` and `window_y + window_height`

3. **Add delay after activating:**
   ```bash
   sleep 0.3
   ```

### Wrong Element Clicked

1. **Take screenshot and visually verify target position**
2. **Adjust percentages incrementally** (try ±5% at a time)
3. **Remember the window includes device frame/bezel** - the actual iOS content area is smaller than the window

### Display Scale Issues

- On Retina Macs, cliclick uses logical points (2x scale)
- Check your display info:
  ```bash
  system_profiler SPDisplaysDataType | grep -i "resolution"
  ```

## Alternative Approaches

### Using AppleScript for UI Elements

You can try clicking UI elements by accessibility hierarchy (less reliable for iOS content):

```applescript
tell application "System Events"
    tell process "Simulator"
        -- This works for simulator chrome (buttons like Volume, Sleep/Wake)
        click button "Action" of window 1
        
        -- iOS app content is deeply nested and harder to target
    end tell
end tell
```

### Using simctl for Other Interactions

```bash
# Open a URL in the simulator
xcrun simctl openurl booted "myapp://somepath"

# Send a push notification
xcrun simctl push booted com.myapp.bundle notification.json

# Add photos/videos
xcrun simctl addmedia booted photo.jpg

# Set location
xcrun simctl location booted set 35.6762,139.6503
```

## Notes

- The iOS simulator doesn't expose touch events via `simctl` directly
- AppleScript accessibility access to iOS app UI elements is limited
- The window-relative percentage approach is the most reliable for clicking
- Always verify clicks with screenshots
- Consider the app's animation timing when chaining multiple clicks
