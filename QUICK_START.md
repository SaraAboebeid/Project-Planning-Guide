# Project Planning Guide - Quick Start Guide

## 🚀 Quick Start

### Installation Steps

1. **Install Backend Dependencies**
```bash
pip install -r requirements.txt
```

2. **Install Frontend Dependencies**
```bash
cd frontend
npm install
```

3. **Run the Application**

**Terminal 1: Start FastAPI Backend**
```bash
python backend/main.py
```

**Terminal 2: Start Vite Frontend**
```bash
cd frontend
npm run dev
```

4. **Access the Dashboard**
Open your browser to: http://localhost:5173

## 📖 Basic Usage

### Step 1: Select Project Scale
Choose from:
- **Building Scale**: For individual structures
- **Neighborhood Scale**: For community development (use archetypes)
- **City Scale**: For metropolitan planning

### Step 2: Configure Details
Fill in scale-specific parameters:
- Building: Type, floors, area
- Neighborhood: Archetype, population, density
- City: Type, population, area

### Step 3: Set Planning Parameters
Define:
- Timeline (< 1 year to 10+ years)
- Budget range (< $1M to > $500M)
- Priorities (sustainability, affordability, etc.)

### Step 4: Analyze & Export
Navigate tabs to:
- View budget allocation
- Generate Gantt charts
- Assess risks
- Export reports (CSV/Excel)

## 🎯 Key Features

### Budget Breakdown
- Interactive sliders for 5 budget phases
- Must total 100% for complete allocation
- Visual pie chart representation

### Timeline Gantt Chart
- Automatically generated based on scale
- Phase-specific timelines
- Exportable timeline table

### Risk Assessment
- 7 risk categories evaluated
- 3-level scoring (Low/Medium/High)
- Overall risk calculation with color coding

### Export Functionality
- **CSV**: Simple summary export
- **Excel**: Multi-sheet workbook with all data
- Timestamped file names

## 💡 Tips

1. **Budget Allocation**: Start with default percentages and adjust
2. **Risks**: Be realistic - medium/high risks help with planning
3. **Save Projects**: Use the save button to compare different scenarios
4. **Export Early**: Download reports before major changes

## ❓ Common Questions

**Q: Can I save my progress?**
A: Yes, use the "Save Project Configuration" button. Data persists in current session.

**Q: How do I export?**
A: Go to Summary Report tab → Export Options → Choose CSV or Excel

**Q: What if budget doesn't add to 100%?**
A: A warning will appear. Adjust sliders until it totals exactly 100%.

**Q: Can I run multiple projects?**
A: Yes, open multiple browser tabs to compare different configurations.

## 🔧 Troubleshooting

**Issue**: Module not found
**Fix**: Run `pip install -r requirements.txt`

**Issue**: Port already in use
**Fix**: `streamlit run planning_guide.py --server.port 8502`

**Issue**: Excel export fails
**Fix**: Ensure openpyxl is installed: `pip install openpyxl`

## 📞 Support

For issues or questions:
- Check README.md for detailed documentation
- Review the troubleshooting section
- Open an issue on GitHub

---
**Version 1.0.0** | Last Updated: January 2026
