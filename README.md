# 🏗️ Project Planning Guide Dashboard

An interactive web-based dashboard for comprehensive planning of urban development projects. This tool helps project managers, urban planners, and developers create detailed project plans with budget breakdowns, timeline visualizations, risk assessments, and export capabilities.

## ✨ Features

### 📊 Multi-Scale Planning Support
- **Building Scale**: Individual structures and facilities
- **Neighborhood Scale**: Community-level development with archetypes
- **City Scale**: Metropolitan and regional planning

### 🎯 Key Capabilities

#### 1. Scale-Specific Configuration
- **Building Projects**: Define building type, floors, gross floor area
- **Neighborhood Projects**: Choose from 7 archetype templates (Mixed-Use Urban, TOD, Garden District, etc.)
- **City Projects**: Plan for compact cities, smart cities, eco-cities, and more

#### 2. Advanced Analytics
- **Budget Breakdown**: Interactive pie charts with customizable allocation across phases
- **Gantt Timeline**: Visual project scheduling with phase dependencies
- **Risk Assessment Matrix**: Evaluate 7 risk categories (financial, technical, regulatory, social, environmental)
- **Summary Reports**: Comprehensive project documentation

#### 3. Export & Documentation
- **CSV Export**: Download project summaries
- **Excel Export**: Multi-sheet workbooks with budget, risks, and timeline data
- **Session Management**: Save multiple project configurations

## 🚀 Getting Started

### Prerequisites
- **Python 3.13+** (tested with Python 3.13.9)
- pip package manager
- Virtual environment tool (venv)

### Installation

#### Option 1: Using Virtual Environment (Recommended)

1. **Clone or download this repository**
```bash
git clone <repository-url>
cd "Project Planning Guide"
```

2. **Create a virtual environment**
```bash
# Windows
python -m venv .venv

# macOS/Linux
python3 -m venv .venv
```

3. **Activate the virtual environment**
```bash
# Windows PowerShell
.venv\Scripts\Activate.ps1

# Windows Command Prompt
.venv\Scripts\activate.bat

# macOS/Linux
source .venv/bin/activate
```

4. **Install required packages**
```bash
pip install -r requirements.txt
```

5. **Run the application**
```bash
streamlit run planning_guide.py
```

6. **Open your browser**
The app will automatically open at `http://localhost:8501`

#### Option 2: System-Wide Installation

```bash
pip install -r requirements.txt
streamlit run planning_guide.py
```

### Environment Details

**Current Environment Configuration:**
- Python Version: 3.13.9
- Environment Type: Virtual Environment (`.venv/`)
- Total Packages: 40+ including dependencies
- Core Framework: Streamlit 1.53.1

## 📦 Dependencies

### Core Libraries
- **streamlit** (1.53.1): Web application framework for Python
- **pandas** (3.0.0): Data manipulation and analysis
- **plotly** (6.5.2): Interactive visualizations and charts
- **openpyxl** (3.1.5): Excel file generation and manipulation

### Supporting Libraries
- **numpy** (2.4.1): Numerical computing
- **python-dateutil** (2.9.0): Date/time handling
- **pytz** (2025.2): Timezone support
- **altair** (6.0.0): Declarative visualization (Streamlit dependency)
- **pyarrow** (23.0.0): Columnar data format support

### Full Package List
See [requirements.txt](requirements.txt) for complete dependency specifications.

**Environment Type:** Virtual Environment (`.venv/`)  
**Python Version:** 3.13.9  
**Total Installed Packages:** 40+

## 🎮 Usage Guide

### Step 1: Define Your Project Scale
Select from three primary scales:
- Building (🏢)
- Neighborhood (🏘️)
- City (🏙️)

### Step 2: Configure Project Details
Based on your selected scale, provide:
- **Building**: Type, floors, area
- **Neighborhood**: Archetype, population, area, density
- **City**: Type, population, area

### Step 3: Set Planning Parameters
- **Timeline**: Project duration (< 1 year to 10+ years)
- **Budget**: Range from < $1M to > $500M
- **Priorities**: Select focus areas (sustainability, affordability, etc.)

### Step 4: Analyze & Visualize
Navigate through analytics tabs:
1. **Budget Breakdown**: Allocate funds across project phases
2. **Timeline Gantt**: View project schedule
3. **Risk Assessment**: Identify and evaluate risks
4. **Summary Report**: Generate comprehensive documentation

### Step 5: Export & Save
- Download CSV or Excel reports
- Save project configurations for comparison
- Review saved projects in session history

## 🏘️ Neighborhood Archetypes

| Archetype | Density | Key Features |
|-----------|---------|--------------|
| Mixed-Use Urban | High (100-300 units/ha) | Retail + Residential, Walkability, Transit |
| Residential Suburban | Low-Medium (15-50 units/ha) | Single-family, Parks, Schools |
| Transit-Oriented Development | High (150-400 units/ha) | Transit Hub, Mixed-Use, Pedestrian-Friendly |
| Garden District | Low (10-30 units/ha) | Green Spaces, Nature Integration |
| Industrial/Commercial | Variable | Employment, Logistics, Business Parks |
| Innovation District | Medium-High (80-200 units/ha) | Tech Spaces, Collaboration |
| Historic Preservation | Variable | Heritage, Adaptive Reuse, Conservation |

## 📊 Budget Phases

The tool allocates budgets across five key phases:
1. **Planning & Design** (15%): Architecture, engineering, permits
2. **Construction** (50%): Building and infrastructure work
3. **Materials & Equipment** (20%): Materials, equipment, furnishings
4. **Contingency** (10%): Unexpected costs and changes
5. **Marketing & Admin** (5%): Marketing, sales, administration

*Default percentages shown; fully customizable in the app*

## ⚠️ Risk Categories

The risk assessment evaluates:
- **Financial**: Budget overrun, funding availability
- **Technical**: Complexity, site conditions
- **Regulatory**: Permit delays, compliance
- **Social**: Community opposition, stakeholder engagement
- **Environmental**: Impact, sustainability concerns

Risk levels: Low (🟢) | Medium (🟡) | High (🔴)

## 📁 Project Structure

```
Project Planning Guide/
├── planning_guide.py       # Main Streamlit application
├── requirements.txt        # Python dependencies
├── README.md              # This file
├── LICENSE                # MIT License
├── .gitignore            # Git ignore rules
├── .streamlit/           # Streamlit configuration
│   └── config.toml       # Theme and server settings
└── Untitled-1.ipynb      # Development notebook
```

## 🔧 Configuration

### Virtual Environment Setup
This project uses a Python virtual environment (`.venv/`) to isolate dependencies:

**Activating the environment:**
```bash
# Windows PowerShell
.venv\Scripts\Activate.ps1

# macOS/Linux
source .venv/bin/activate
```

**Deactivating when done:**
```bash
deactivate
```

**Verifying your environment:**
```bash
# Check Python version
python --version

# List installed packages
pip list
```

### Streamlit Settings
Edit `.streamlit/config.toml` to customize:
- Theme colors
- Server port
- Max upload size
- Browser auto-open behavior

### Environment Variables
No environment variables required for basic operation.

### Python Path
When using the virtual environment, Python is located at:
- Windows: `C:/Users/saraabo/Desktop/Project Planning Guide/.venv/Scripts/python.exe`
- macOS/Linux: `./venv/bin/python`

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Troubleshooting

### Common Issues

**Issue**: `ModuleNotFoundError: No module named 'streamlit'`  
**Solution**: 
1. Ensure virtual environment is activated
2. Run `pip install -r requirements.txt`
3. Verify with `pip list | grep streamlit`

**Issue**: `streamlit: command not found`  
**Solution**:
- Windows: Activate virtual environment with `.venv\Scripts\Activate.ps1`
- Use full path: `python -m streamlit run planning_guide.py`

**Issue**: Port already in use  
**Solution**: Run with custom port: `streamlit run planning_guide.py --server.port 8502`

**Issue**: Excel export not working  
**Solution**: Ensure openpyxl is installed: `pip install openpyxl`

**Issue**: Virtual environment not activating on Windows  
**Solution**: 
1. Check PowerShell execution policy: `Get-ExecutionPolicy`
2. If restricted, run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
3. Retry activation

**Issue**: Wrong Python version  
**Solution**:
1. Check version: `python --version`
2. Create new environment with specific version: `python3.13 -m venv .venv`
3. Reinstall dependencies

## 🔮 Future Enhancements

Planned features for upcoming versions:
- [ ] Database integration for persistent storage
- [ ] Multi-user collaboration
- [ ] PDF report generation with charts
- [ ] GIS integration for spatial planning
- [ ] Cost estimation templates by region
- [ ] Sustainability scoring system
- [ ] Integration with project management tools (Jira, Asana)
- [ ] Mobile-responsive design improvements

## 📞 Support

For questions, issues, or suggestions:
- Open an issue on GitHub
- Contact the development team
- Check the [Wiki](../../wiki) for detailed documentation

## 🙏 Acknowledgments

- Built with [Streamlit](https://streamlit.io/)
- Visualizations powered by [Plotly](https://plotly.com/)
- Data handling with [Pandas](https://pandas.pydata.org/)

## 📊 Screenshots

### Dashboard Overview
The main interface provides three-column layout for scale selection, project configuration, and planning parameters.

### Analytics Tabs
- Budget visualizations with interactive pie charts
- Gantt charts with phase-specific timelines
- Risk assessment matrix with color-coded levels
- Comprehensive summary reports with export options

## 🔐 Data Privacy

- All data is processed locally on your machine
- No data is transmitted to external servers
- Session data is stored in browser memory only
- Exported files contain only the data you input

---

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Status**: Production Ready ✅
