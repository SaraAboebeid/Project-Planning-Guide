# Project Planning Guide - Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-26

### Added
- Initial release of Project Planning Guide Dashboard
- Three-scale project planning system (Building, Neighborhood, City)
- Seven neighborhood archetypes with detailed characteristics
- Six building types with customizable parameters
- Six city planning categories
- Interactive budget allocation with pie chart visualization
- Dynamic Gantt chart timeline generation based on project scale
- Comprehensive risk assessment matrix with 7 risk categories
- Project summary report generation
- CSV export functionality
- Excel export with multi-sheet workbooks
- Session-based project configuration saving
- Custom Streamlit theming
- Responsive three-column layout
- Real-time budget allocation validation
- Density calculations for all scales
- Priority selection system (8 priority options)
- Timeline slider with 5 duration options
- Budget range selector with 6 ranges
- Color-coded risk level indicators
- Expandable sections for additional details
- Comprehensive documentation (README, QUICK_START, CONTRIBUTING)
- MIT License
- Requirements.txt with pinned dependencies
- .gitignore for Python projects
- Streamlit configuration file

### Features by Scale

#### Building Scale
- Building type selection (6 types)
- Floor count input (1-150)
- Gross floor area calculation
- Average floor area metrics

#### Neighborhood Scale
- Archetype system with 7 templates
- Population estimation (1,000-50,000)
- Area input in hectares (5-500)
- Density calculations (people/ha)
- Archetype-specific characteristics display

#### City Scale
- City category selection (6 types)
- Population slider (50,000-5,000,000)
- Area input in square kilometers (10-5,000)
- Population density calculations (people/km²)

### Analytics Features
- Budget allocation across 5 phases with validation
- Scale-specific Gantt chart phases
- Risk assessment with weighted scoring
- Overall risk calculation and color coding
- Comprehensive summary tables
- Timeline table views
- Export timestamped files

### Technical Details
- Built with Streamlit 1.31.0+
- Plotly for interactive visualizations
- Pandas for data manipulation
- OpenPyXL for Excel export
- Python 3.8+ compatibility

---

## [Unreleased]

### Planned Features
- Database integration for persistent storage
- Multi-user collaboration capabilities
- PDF report generation with embedded charts
- GIS integration for spatial planning
- Regional cost estimation templates
- Sustainability scoring system
- Project management tool integration
- Enhanced mobile responsiveness
- Multi-language support (i18n)
- Advanced filtering and search
- Project comparison view
- Historical project analytics
- Template library
- Custom archetype creation
- API for programmatic access

---

## Version History

- **1.0.0** (2026-01-26): Initial release with full feature set
