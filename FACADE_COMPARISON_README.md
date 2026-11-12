# Facade Inspector & Comparison Feature

## Overview
The Facade Inspector and Comparison feature allows you to analyze and compare building facades for renovation prioritization. This tool supports both AI-powered analysis and manual scoring.

## Features

### 1. **Facade Inspector** (Existing - Enhanced)
- Capture facades from 4 cardinal directions (N, E, S, W)
- Manual rubber-band crop for custom angles
- AI-powered Window-to-Wall Ratio (WWR) estimation
- Heuristic fallback when AI is not available
- Save WWR data to database

### 2. **Facade Comparison** (NEW)
Two comparison modes:

#### Single Building Mode
- Compare all 4 facades of a single building
- View side-by-side facade captures
- AI or manual condition scoring (0-100)
- Automatic renovation priority ranking
- Identify which facades need urgent attention

#### Multiple Buildings Mode
- Add up to 4 buildings for comparison
- Capture and analyze facades from each building
- Compare renovation priorities across buildings
- Estimate renovation costs
- Export comparison data for reporting

## How to Use

### Accessing the Feature

1. **Open the 3D Viewer**
   - Run `python launch.py` from the project root
   - Navigate to `http://localhost:8765`

2. **Select a Building**
   - Click on any building in the 3D map
   - The info panel will appear with building details
   - Two analysis buttons will be enabled:
     - **Inspect window to wall ratio** (existing feature)
     - **Inspect Facades** (new feature)

### Single Building Comparison

1. Click **Inspect Facades** button
2. The comparison panel opens in "Single Building" mode by default
3. Click on each facade preview (N, E, S, W) to capture it
4. Choose analysis method:
   - **🤖 AI Analyze**: Uses Claude or GPT-4 vision to assess:
     - Window-to-Wall Ratio (WWR)
     - Condition score (0-100)
     - Visual defects (cracks, weathering, etc.)
     - Maintenance needs (immediate/short-term/long-term)
   - **✏️ Manual Score**: Open a modal to rate each facade manually (0-100)
5. View the priority ranking to see which facades need attention first

### Multiple Buildings Comparison

1. Click **Inspect Facades** button
2. Switch to **Multiple Buildings** mode
3. Select buildings on the map and click **➕ Add Building**
   - You can add up to 4 buildings
4. For each building, click the small facade previews to capture
5. Click **🤖 AI Analyze** or **✏️ Manual Score**
6. Review the comparison:
   - Average condition scores
   - Renovation priority (High/Medium/Low)
   - Estimated renovation costs
7. The buildings are ranked by priority at the bottom

### Exporting Data

- Click **💾 Export Data** to download a JSON file containing:
  - All building information
  - Facade captures and scores
  - AI analysis results
  - Priority rankings
  - Timestamp

### Clearing Data

- Click **🗑️ Clear All** to reset the comparison and start fresh

## AI Analysis Requirements

The facade analysis uses AI vision models to assess condition and WWR:

1. **Claude (Anthropic)** - Primary (recommended)
   - Set environment variable: `ANTHROPIC_API_KEY`
   - Model: `claude-sonnet-4-5`
   - Most accurate facade condition assessment

2. **OpenAI GPT-4** - Fallback
   - Set environment variable: `OPENAI_API_KEY`
   - Model: `gpt-4.1-vision`
   - Good alternative if Claude is not available

3. **Heuristic** - No API key required
   - Estimates based on building age, use type, and energy class
   - Less accurate but always available

### Setting API Keys

**Windows (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY = "your-api-key-here"
$env:OPENAI_API_KEY = "your-openai-key-here"
python launch.py
```

**Linux/Mac:**
```bash
export ANTHROPIC_API_KEY="your-api-key-here"
export OPENAI_API_KEY="your-openai-key-here"
python launch.py
```

## Scoring System

### Condition Score (0-100)
- **90-100**: Excellent condition, new or recently renovated
- **75-89**: Good condition, minor maintenance needed
- **60-74**: Fair condition, moderate renovation needed
- **40-59**: Poor condition, significant renovation needed
- **0-39**: Critical condition, urgent renovation required

### Priority Levels
- **High**: Urgent attention needed (score < 40 or very old + poor energy class)
- **Medium**: Should be addressed in 1-3 years
- **Low**: Long-term planning (5+ years)

## Technical Details

### Files Modified/Created

1. **viewer/js/facade_comparison.js** (NEW)
   - Main comparison module
   - Handles UI state and facade capture
   - Manages building selection and comparison

2. **viewer/index.html** (MODIFIED)
   - Added comparison panel HTML
   - Added "Inspect Facades" button

3. **viewer/styles/main.css** (MODIFIED)
   - Added styles for comparison panel
   - Mode button styles

4. **viewer/js/ui.js** (MODIFIED)
   - Enable/disable compare button on building selection

5. **backend/main.py** (MODIFIED)
   - Added `/api/analyze-facade` endpoint
   - AI-powered facade condition analysis

6. **build.py** (MODIFIED)
   - Added facade_comparison.js to build pipeline

### API Endpoint

**POST /api/analyze-facade**

Request:
```json
{
  "image_base64": "base64-encoded-jpeg",
  "direction": "N|E|S|W",
  "building_info": {
    "address": "Street Name 123",
    "year": 1975,
    "use": "bostad_flerfamilj",
    "eclass": "D"
  }
}
```

Response:
```json
{
  "wwr": 35,
  "score": 65,
  "confidence": "high",
  "defects": "Minor weathering, some paint deterioration",
  "maintenance": "short-term",
  "notes": "Overall good condition for age",
  "source": "claude-sonnet-4-5-vision"
}
```

## Building and Running

1. **Build the viewer** (after making changes):
   ```bash
   python build.py
   ```
   This compiles all viewer source files into `assets/gothenburg_3d.html`

2. **Start the backend server**:
   ```bash
   python launch.py
   ```
   Opens `http://localhost:8765` in your browser

## Tips and Best Practices

1. **Capture Quality**
   - Wait for the camera to fully stop before capturing
   - Use the zoom controls to get a clear view of the facade
   - Ensure the building fills most of the frame

2. **Manual Scoring**
   - Consider: cracks, weathering, paint condition, window frames
   - Lower scores = higher renovation priority
   - Be consistent across buildings for meaningful comparisons

3. **AI Analysis**
   - Works best with clear, well-lit facades
   - Google Photorealistic 3D Tiles provide the best source imagery
   - AI can detect issues not visible in heuristic mode

4. **Renovation Planning**
   - Use "Multiple Buildings" mode to prioritize budget allocation
   - Export data for stakeholder presentations
   - Combine with WWR analysis and PV estimates for comprehensive planning

## Troubleshooting

**Compare button stays disabled:**
- Make sure you've selected a building first
- Check the browser console for JavaScript errors

**AI analysis fails:**
- Verify API keys are set correctly
- Check backend console for error messages
- Falls back to heuristic mode automatically

**Captures are black/empty:**
- Ensure Google 3D Tiles are loaded
- Wait longer for the camera to settle
- Check that the building is visible in the viewport

## Future Enhancements

Possible improvements:
- Thermal imaging overlay
- Historical comparison (facade degradation over time)
- Automatic defect detection (crack mapping)
- Cost estimation wizard
- Multi-year renovation planning
- Integration with BIM/CAD export

## Support

For issues or questions:
1. Check the browser console for errors
2. Review the backend logs (`launch.py` output)
3. Verify all files are properly built (`python build.py`)
4. Ensure API keys are valid and have sufficient credits
