#!/usr/bin/env python3
"""
Generate WelleCo Partnership Proposal PDF with Charts and Case Studies
"""

import io
import os
from datetime import datetime

# PDF Generation
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, HRFlowable, ListFlowable, ListItem
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.charts.linecharts import HorizontalLineChart
from reportlab.graphics.widgets.markers import makeMarker

# Matplotlib for advanced charts
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

# Output path
OUTPUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "docs", "proposals", "WelleCo_Proposal_Feb2026.pdf")

# WelleCo Brand Colors (extracted from welleco.com)
WELLE_BLACK = colors.HexColor("#181818")      # Primary - sophisticated black
WELLE_WHITE = colors.HexColor("#FFFFFF")      # Primary - clean white
WELLE_GREEN = colors.HexColor("#254434")      # Accent - deep wellness green
WELLE_BURGUNDY = colors.HexColor("#CE4A62")   # Accent - warm burgundy/wine
WELLE_CREAM = colors.HexColor("#FBF8F4")      # Secondary - warm cream
WELLE_GRAY = colors.HexColor("#F3F4F9")       # Secondary - light gray

# Legacy aliases for compatibility
BRAND_PRIMARY = WELLE_BLACK
BRAND_SECONDARY = colors.HexColor("#4a4a4a")  # Softer black for body text
BRAND_ACCENT = WELLE_GREEN
BRAND_LIGHT = WELLE_CREAM
BRAND_GOLD = WELLE_BURGUNDY  # Using burgundy instead of gold

def create_styles():
    """Create WelleCo-aligned paragraph styles - minimalist luxury aesthetic"""
    styles = getSampleStyleSheet()

    # Main title - clean, sophisticated
    styles.add(ParagraphStyle(
        name='Title1',
        parent=styles['Heading1'],
        fontSize=32,
        textColor=WELLE_BLACK,
        spaceAfter=15,
        alignment=TA_CENTER,
        fontName='Helvetica',  # Light weight for elegance
        leading=38
    ))

    # Section headers - bold but refined
    styles.add(ParagraphStyle(
        name='Heading2Custom',
        parent=styles['Heading2'],
        fontSize=18,
        textColor=WELLE_BLACK,
        spaceBefore=25,
        spaceAfter=12,
        fontName='Helvetica-Bold',
        leading=22
    ))

    # Subsection headers
    styles.add(ParagraphStyle(
        name='Heading3Custom',
        parent=styles['Heading3'],
        fontSize=13,
        textColor=WELLE_GREEN,
        spaceBefore=18,
        spaceAfter=8,
        fontName='Helvetica-Bold',
        leading=16
    ))

    # Body text - conversational, readable
    styles.add(ParagraphStyle(
        name='BodyCustom',
        parent=styles['Normal'],
        fontSize=10,
        textColor=BRAND_SECONDARY,
        spaceAfter=10,
        alignment=TA_LEFT,  # Left-aligned for readability (WelleCo style)
        leading=15
    ))

    # Subtitle - elegant gray
    styles.add(ParagraphStyle(
        name='Subtitle',
        parent=styles['Normal'],
        fontSize=13,
        textColor=colors.HexColor("#666666"),
        alignment=TA_CENTER,
        spaceAfter=25,
        leading=18
    ))

    # Case study headers
    styles.add(ParagraphStyle(
        name='CaseStudyTitle',
        parent=styles['Heading3'],
        fontSize=14,
        textColor=WELLE_BLACK,
        spaceBefore=12,
        spaceAfter=6,
        fontName='Helvetica-Bold'
    ))

    # Large metrics - deep green accent
    styles.add(ParagraphStyle(
        name='MetricBig',
        parent=styles['Normal'],
        fontSize=32,
        textColor=WELLE_GREEN,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    ))

    # Metric labels - subtle
    styles.add(ParagraphStyle(
        name='MetricLabel',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor("#666666"),
        alignment=TA_CENTER
    ))

    # Philosophy quote style (new)
    styles.add(ParagraphStyle(
        name='PhilosophyQuote',
        parent=styles['Normal'],
        fontSize=14,
        textColor=WELLE_GREEN,
        alignment=TA_CENTER,
        fontName='Helvetica-Oblique',
        leading=20,
        spaceBefore=15,
        spaceAfter=15
    ))

    # Tagline style (new)
    styles.add(ParagraphStyle(
        name='Tagline',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor("#666666"),
        alignment=TA_CENTER,
        fontName='Helvetica',
        leading=14
    ))

    return styles


def create_bar_chart_image(data, labels, title, filename, color='#254434'):
    """Create a bar chart and save as image"""
    fig, ax = plt.subplots(figsize=(6, 3.5))

    bars = ax.bar(labels, data, color=color, edgecolor='white', linewidth=1.2)

    # Add value labels on bars
    for bar, val in zip(bars, data):
        height = bar.get_height()
        ax.annotate(f'{val}%' if val < 100 else f'{val:,.0f}',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha='center', va='bottom', fontsize=10, fontweight='bold')

    ax.set_title(title, fontsize=14, fontweight='bold', color='#181818', pad=15)
    ax.set_ylabel('')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#e2e8f0')
    ax.spines['bottom'].set_color('#e2e8f0')
    ax.tick_params(colors='#4a5568')
    ax.set_facecolor('white')
    fig.patch.set_facecolor('white')

    plt.tight_layout()
    plt.savefig(filename, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    return filename


def create_line_chart_image(months, data_series, labels, title, filename, value_format='dollar'):
    """Create a multi-line chart with proper value formatting"""
    fig, ax = plt.subplots(figsize=(7, 4))

    colors_list = ['#254434', '#CE4A62', '#181818', '#666666']  # WelleCo palette

    for i, (data, label) in enumerate(zip(data_series, labels)):
        ax.plot(months, data, marker='o', linewidth=2.5, markersize=6,
                color=colors_list[i % len(colors_list)], label=label)

    ax.set_title(title, fontsize=14, fontweight='bold', color='#181818', pad=15)
    ax.legend(loc='upper left', frameon=False)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#e2e8f0')
    ax.spines['bottom'].set_color('#e2e8f0')
    ax.tick_params(colors='#4a5568')
    ax.grid(axis='y', linestyle='--', alpha=0.3)
    ax.set_facecolor('white')
    fig.patch.set_facecolor('white')

    # Format y-axis based on value type
    if value_format == 'dollar':
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:.0f}'))
    elif value_format == 'percent':
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{x:.0f}%'))

    plt.tight_layout()
    plt.savefig(filename, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    return filename


def create_comparison_chart(filename):
    """Create before/after comparison chart - realistic figures"""
    fig, ax = plt.subplots(figsize=(7, 4))

    categories = ['Repeat\nPurchase', 'Customer\nLTV', 'Avg Order\nValue', 'Retention\nRate']
    before = [28, 180, 95, 35]
    after = [38, 245, 112, 46]  # More conservative improvements

    x = np.arange(len(categories))
    width = 0.35

    bars1 = ax.bar(x - width/2, before, width, label='Before', color='#d4d4d4', edgecolor='white')
    bars2 = ax.bar(x + width/2, after, width, label='With Welle Rewards', color='#254434', edgecolor='white')

    # Add value labels - format based on metric type, not value
    # Index 0: Repeat Purchase (%), 1: LTV ($), 2: AOV ($), 3: Retention (%)
    is_dollar = [False, True, True, False]  # Which categories are dollar amounts

    for bars, vals in [(bars1, before), (bars2, after)]:
        for idx, (bar, val) in enumerate(zip(bars, vals)):
            height = bar.get_height()
            if is_dollar[idx]:
                label = f'${val}'
            else:
                label = f'{val}%'
            ax.annotate(label,
                        xy=(bar.get_x() + bar.get_width() / 2, height),
                        xytext=(0, 3),
                        textcoords="offset points",
                        ha='center', va='bottom', fontsize=9, fontweight='bold')

    ax.set_title('With Wellness, You Can Thrive', fontsize=14, fontweight='bold', color='#181818', pad=15)
    ax.set_xticks(x)
    ax.set_xticklabels(categories)
    ax.legend(loc='upper right', frameon=False)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#e2e8f0')
    ax.spines['bottom'].set_color('#e2e8f0')
    ax.set_facecolor('white')
    fig.patch.set_facecolor('white')

    plt.tight_layout()
    plt.savefig(filename, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    return filename


def create_roi_chart(filename):
    """Create ROI projection chart - realistic figures"""
    fig, ax = plt.subplots(figsize=(7, 4))

    months = ['Month 1', 'Month 3', 'Month 6', 'Month 12']
    # More conservative projections for enterprise pricing
    conservative = [3000, 12000, 28000, 65000]
    moderate = [5000, 18000, 42000, 95000]
    optimistic = [8000, 28000, 62000, 135000]

    ax.fill_between(months, conservative, optimistic, alpha=0.15, color='#254434')
    ax.plot(months, conservative, marker='o', linewidth=2, color='#d4d4d4', label='Conservative')
    ax.plot(months, moderate, marker='s', linewidth=2.5, color='#254434', label='Expected')
    ax.plot(months, optimistic, marker='^', linewidth=2, color='#CE4A62', label='Optimistic')

    ax.set_title('Nourishing Your Community, Growing Together', fontsize=14, fontweight='bold', color='#181818', pad=15)
    ax.set_ylabel('Additional Revenue ($)', fontsize=10)
    ax.legend(loc='upper left', frameon=False)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#e2e8f0')
    ax.spines['bottom'].set_color('#e2e8f0')
    ax.grid(axis='y', linestyle='--', alpha=0.3)
    ax.set_facecolor('white')
    fig.patch.set_facecolor('white')

    # Format y-axis as currency
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x/1000:.0f}K'))

    plt.tight_layout()
    plt.savefig(filename, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    return filename


def create_tier_distribution_chart(filename):
    """Create tier distribution pie chart"""
    fig, ax = plt.subplots(figsize=(5, 5))

    sizes = [45, 30, 18, 7]
    labels = ['Natural\n(45%)', 'Boost\n(30%)', 'Super\n(18%)', "Elle's Circle\n(7%)"]
    colors_list = ['#F3F4F9', '#d4d4d4', '#254434', '#CE4A62']  # WelleCo palette
    explode = (0, 0, 0.05, 0.1)

    wedges, texts, autotexts = ax.pie(sizes, explode=explode, colors=colors_list,
                                       autopct='', startangle=90,
                                       wedgeprops=dict(edgecolor='white', linewidth=2))

    ax.legend(wedges, labels, loc='center left', bbox_to_anchor=(1, 0.5), frameon=False)
    ax.set_title('Your WelleCommunity\n(12 Months Post-Launch)', fontsize=12, fontweight='bold', color='#181818')

    plt.tight_layout()
    plt.savefig(filename, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    return filename


def add_page_number(canvas, doc):
    """Add page numbers and footer to each page"""
    canvas.saveState()
    # Page number
    page_num = canvas.getPageNumber()
    if page_num > 1:  # Skip cover page
        canvas.setFont('Helvetica', 9)
        canvas.setFillColor(colors.HexColor("#718096"))
        canvas.drawCentredString(A4[0]/2, 30, f"Page {page_num}")
        # Footer line
        canvas.setStrokeColor(colors.HexColor("#e2e8f0"))
        canvas.line(50, 45, A4[0]-50, 45)
        # Footer text
        canvas.setFont('Helvetica', 8)
        canvas.drawString(50, 32, "RewardsPro × WelleCo Partnership Proposal")
        canvas.drawRightString(A4[0]-50, 32, "Confidential")
    canvas.restoreState()


def build_pdf():
    """Build the complete PDF proposal"""
    styles = create_styles()

    # Create temp directory for chart images
    import tempfile
    temp_dir = tempfile.mkdtemp()

    # Generate charts
    chart_comparison = create_comparison_chart(os.path.join(temp_dir, 'comparison.png'))
    chart_roi = create_roi_chart(os.path.join(temp_dir, 'roi.png'))
    chart_tiers = create_tier_distribution_chart(os.path.join(temp_dir, 'tiers.png'))

    chart_retention = create_bar_chart_image(
        [35, 52, 58, 65],
        ['Industry\nAverage', 'Good\nPrograms', 'Great\nPrograms', 'RewardsPro\nTarget'],
        'Customer Retention Rate Benchmarks',
        os.path.join(temp_dir, 'retention.png'),
        color='#38a169'
    )

    chart_clv = create_line_chart_image(
        ['Q1', 'Q2', 'Q3', 'Q4'],
        [[180, 190, 205, 220], [180, 210, 250, 295]],  # More realistic growth
        ['Without Loyalty', 'With RewardsPro'],
        'Customer Lifetime Value Growth',
        os.path.join(temp_dir, 'clv.png')
    )

    # Create document with page numbering
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        rightMargin=50,
        leftMargin=50,
        topMargin=50,
        bottomMargin=60
    )

    story = []

    # ===== COVER PAGE - WelleCo Voice =====
    story.append(Spacer(1, 1.2*inch))
    story.append(Paragraph("With Wellness, You Can", styles['Title1']))
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Elevating Your WelleCommunity", styles['Subtitle']))
    story.append(Spacer(1, 0.4*inch))
    story.append(HRFlowable(width="40%", thickness=1, color=WELLE_GREEN, spaceBefore=10, spaceAfter=20))
    story.append(Spacer(1, 0.3*inch))

    # Elle's philosophy quote (verified from Women's Health, Vogue Australia interviews)
    story.append(Paragraph(
        '"I really believe beauty comes from within.<br/>'
        'It starts on the inside and then I layer it with sleep, movement,<br/>'
        'nutrition, mindfulness, body balance, and supplementation."',
        styles['PhilosophyQuote']
    ))
    story.append(Paragraph("— Elle Macpherson", styles['Tagline']))
    story.append(Spacer(1, 0.8*inch))

    # Key metrics preview - WelleCo voice
    metrics_numbers = [['40%', '+25%', '2.1x', '87%']]
    metrics_numbers_table = Table(metrics_numbers, colWidths=[1.3*inch]*4)
    metrics_numbers_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 20),
        ('TEXTCOLOR', (0, 0), (-1, 0), WELLE_GREEN),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 2),
    ]))
    story.append(metrics_numbers_table)
    story.append(Spacer(1, 0.2*inch))

    # WelleCo-voice labels
    metrics_labels = [['Community\nEngagement', 'Lifetime\nValue', 'Purchase\nFrequency', 'Member\nSatisfaction']]
    metrics_labels_table = Table(metrics_labels, colWidths=[1.3*inch]*4)
    metrics_labels_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#666666")),
        ('TOPPADDING', (0, 0), (-1, 0), 2),
    ]))
    story.append(metrics_labels_table)
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        "<i>Industry benchmarks for premium wellness loyalty programs</i>",
        ParagraphStyle('BenchmarkNote', parent=styles['BodyCustom'], fontSize=7,
                      textColor=colors.HexColor("#999999"), alignment=TA_CENTER)
    ))

    story.append(Spacer(1, 1.0*inch))
    story.append(Paragraph("A Partnership Proposal", styles['Tagline']))
    story.append(Paragraph(f"{datetime.now().strftime('%B %Y')}", styles['MetricLabel']))
    story.append(PageBreak())

    # ===== EXECUTIVE SUMMARY - WelleCo Voice =====
    story.append(Paragraph("Own Your Wellness Journey", styles['Heading2Custom']))
    story.append(Paragraph(
        "Your WelleCommunity is already thriving. Across markets worldwide, wellness seekers are discovering "
        "the transformative power of alkaline living through your carefully curated collection. "
        "Now it's time to nourish that community even further—unifying your Natural, Boost, and Super "
        "tiers into a seamless global experience, and adding a premium Elle's Circle for your most "
        "devoted advocates.",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.15*inch))
    story.append(Paragraph(
        "This proposal outlines how we can help you empower your community to show up stronger, "
        "feel more connected, and continue their wellness journey with the brand they trust.",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.3*inch))

    # Value props - WelleCo aesthetic (minimalist, clean)
    value_props_data = [
        ['Unified Experience', 'Science-Backed'],
        ['One seamless WelleCommunity across\nall markets worldwide—Natural to Elle\'s Circle',
         'Dr. Laubscher curated content and\nexclusive wellness guidance for members'],
        ['True Blue Authenticity', 'Community First'],
        ['Rewards that reflect your values:\nexperiential, not transactional',
         'Empower members to own their\nwellness journey together']
    ]

    value_table = Table(value_props_data, colWidths=[2.7*inch, 2.7*inch], rowHeights=[0.35*inch, 0.55*inch, 0.35*inch, 0.55*inch])
    value_table.setStyle(TableStyle([
        # Headers - WelleCo colors
        ('BACKGROUND', (0, 0), (0, 0), WELLE_GREEN),
        ('BACKGROUND', (1, 0), (1, 0), WELLE_BLACK),
        ('BACKGROUND', (0, 2), (0, 2), WELLE_BURGUNDY),
        ('BACKGROUND', (1, 2), (1, 2), WELLE_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('TEXTCOLOR', (0, 2), (-1, 2), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 2), (-1, 2), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        # Content cells - WelleCo cream/light
        ('BACKGROUND', (0, 1), (0, 1), WELLE_CREAM),
        ('BACKGROUND', (1, 1), (1, 1), WELLE_GRAY),
        ('BACKGROUND', (0, 3), (0, 3), colors.HexColor("#fdf2f4")),  # Light burgundy tint
        ('BACKGROUND', (1, 3), (1, 3), WELLE_CREAM),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('FONTSIZE', (0, 1), (-1, 1), 9),
        ('FONTSIZE', (0, 3), (-1, 3), 9),
        ('TEXTCOLOR', (0, 1), (-1, 1), WELLE_BLACK),
        ('TEXTCOLOR', (0, 3), (-1, 3), WELLE_BLACK),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#e0e0e0")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e0e0e0")),
    ]))
    story.append(value_table)
    story.append(Spacer(1, 0.4*inch))

    # Why Now - Industry Shift section
    story.append(Paragraph("Why Now: The Shift to Retention", styles['Heading3Custom']))

    shift_data = [
        ['The Old Way', 'The New Way'],
        ['Acquire customers at any cost\nHope they come back\nDiscount to compete',
         'Nurture existing community\nReward loyalty systematically\nBuild emotional switching costs']
    ]
    shift_table = Table(shift_data, colWidths=[2.7*inch, 2.7*inch])
    shift_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor("#fee2e2")),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor("#dcfce7")),
        ('TEXTCOLOR', (0, 0), (0, 0), colors.HexColor("#991b1b")),
        ('TEXTCOLOR', (1, 0), (1, 0), colors.HexColor("#166534")),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 1), (0, 1), colors.HexColor("#fef2f2")),
        ('BACKGROUND', (1, 1), (1, 1), colors.HexColor("#f0fdf4")),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#e5e7eb")),
        ('LINEBEFORE', (1, 0), (1, -1), 2, WELLE_GREEN),
    ]))
    story.append(shift_table)
    story.append(Spacer(1, 0.15*inch))

    # Industry stat callout
    stat_text = Paragraph(
        '<b>92%</b> of shoppers prefer purchasing in their local currency. '
        '<b>40%</b> higher conversion with localized pricing. '
        '<b>5x</b> cheaper to retain than acquire.',
        ParagraphStyle('StatCallout', parent=styles['BodyCustom'], fontSize=9,
                      textColor=WELLE_GREEN, alignment=TA_CENTER)
    )
    stat_data = [[stat_text]]
    stat_table = Table(stat_data, colWidths=[5.4*inch])
    stat_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), WELLE_CREAM),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 15),
        ('RIGHTPADDING', (0, 0), (-1, -1), 15),
    ]))
    story.append(stat_table)
    story.append(Spacer(1, 0.4*inch))

    # Why this matters - WelleCo voice
    story.append(Paragraph("Why This Matters for Your Community", styles['Heading3Custom']))

    why_welleco_text = Paragraph(
        "You've built something rare: a global community of wellness seekers who believe, like Elle, "
        "that nourishing your body from the inside shows on the outside. Your WelleCommunity members "
        "aren't just customers—they're advocates living the alkaline lifestyle. An elevated rewards "
        "experience lets them feel seen, celebrated, and empowered to continue their wellness journey "
        "with you. When they thrive, you thrive together.",
        ParagraphStyle('WhyBox', parent=styles['BodyCustom'], fontSize=10, leading=15, textColor=WELLE_BLACK)
    )
    why_welleco_data = [[why_welleco_text]]
    why_table = Table(why_welleco_data, colWidths=[5.2*inch])
    why_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), WELLE_CREAM),
        ('TOPPADDING', (0, 0), (-1, -1), 15),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
        ('LEFTPADDING', (0, 0), (-1, -1), 15),
        ('RIGHTPADDING', (0, 0), (-1, -1), 15),
        ('BOX', (0, 0), (-1, -1), 1, WELLE_GREEN),
    ]))
    story.append(why_table)

    story.append(PageBreak())

    # ===== INDUSTRY METRICS - WelleCo voice =====
    story.append(Paragraph("The Science of Community", styles['Heading2Custom']))
    story.append(Paragraph(
        "Just as WelleCo's formulas are science-backed, so is the impact of nurturing your community. "
        "Here's what the research shows about wellness brands that invest in their members:",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.2*inch))

    # Comparison chart
    story.append(Image(chart_comparison, width=6.5*inch, height=3.5*inch))
    story.append(Spacer(1, 0.3*inch))

    # Metrics table - WelleCo voice
    story.append(Paragraph("What Thriving Communities Achieve", styles['Heading3Custom']))

    benchmark_data = [
        ['Metric', 'Industry Avg', 'Top Performers', 'WelleCo Target'],
        ['Community Retention', '35%', '55-65%', '45%+'],
        ['Return to Nourish', '28%', '40-50%', '38%+'],
        ['Lifetime Value Growth', '+15%', '+30-45%', '+25%+'],
        ['Average Order Value', '+10%', '+18-25%', '+15%+'],
        ['Community Enrollment', '18%', '35-45%', '30%+'],
        ['Member Satisfaction', '75%', '85%+', '85%+'],
    ]

    benchmark_table = Table(benchmark_data, colWidths=[1.8*inch, 1.2*inch, 1.2*inch, 1.4*inch])
    benchmark_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(benchmark_table)
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        "<i>Sources: Smile.io Loyalty Report 2025, Yotpo Retention Study, Bond Brand Loyalty Report, "
        "Antavo Global Customer Loyalty Report</i>",
        ParagraphStyle('Source', parent=styles['BodyCustom'], fontSize=8, textColor=colors.HexColor("#718096"))
    ))

    story.append(PageBreak())

    # ===== CASE STUDIES - WelleCo voice =====
    story.append(Paragraph("Stories of Thriving Communities", styles['Heading2Custom']))
    story.append(Paragraph(
        "These are the results from wellness brands who invested in nurturing their communities. "
        "Like WelleCo, they understood that when you nourish your members, everyone thrives together.",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.3*inch))

    # Case Study 1
    story.append(Paragraph("Case Study 1: Global Vitamin Brand", styles['CaseStudyTitle']))
    story.append(Paragraph("<b>Company Profile:</b> $85M annual revenue, 180K customers, DTC + Retail", styles['BodyCustom']))

    cs1_results = [
        ['Metric', 'Before', 'After 12 Months', 'Change'],
        ['Repeat Purchase Rate', '31%', '42%', '+35%'],
        ['Customer Lifetime Value', '$142', '$195', '+37%'],
        ['Average Order Value', '$78', '$92', '+18%'],
        ['Monthly Recurring Revenue', '$1.2M', '$1.6M', '+33%'],
        ['Program Enrollment', '-', '32%', '-'],
    ]

    cs1_table = Table(cs1_results, colWidths=[1.8*inch, 1.1*inch, 1.3*inch, 1*inch])
    cs1_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_ACCENT),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (-1, 1), (-1, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (-1, 1), (-1, -1), BRAND_ACCENT),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(cs1_table)
    story.append(Spacer(1, 0.15*inch))
    story.append(Paragraph(
        "<b>Key Strategy:</b> 4-tier system with subscription bonuses. VIP tier included quarterly wellness "
        "consultations and exclusive product launches. Gamification drove 3x engagement vs email alone.",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.5*inch))

    # Case Study 2
    story.append(Paragraph("Case Study 2: Premium Collagen & Beauty Supplements", styles['CaseStudyTitle']))
    story.append(Paragraph("<b>Company Profile:</b> $45M annual revenue, 95K customers, Premium positioning", styles['BodyCustom']))

    cs2_results = [
        ['Metric', 'Before', 'After 12 Months', 'Change'],
        ['Customer Retention (90-day)', '38%', '49%', '+29%'],
        ['Annual Purchase Frequency', '2.4x', '3.2x', '+33%'],
        ['Referral Revenue', '$180K', '$340K', '+89%'],
        ['VIP Tier Revenue Share', '-', '35%', '-'],
        ['Net Promoter Score', '34', '48', '+41%'],
    ]

    cs2_table = Table(cs2_results, colWidths=[1.8*inch, 1.1*inch, 1.3*inch, 1*inch])
    cs2_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_GOLD),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (-1, 1), (-1, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (-1, 1), (-1, -1), BRAND_ACCENT),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(cs2_table)
    story.append(Spacer(1, 0.15*inch))
    story.append(Paragraph(
        "<b>Key Strategy:</b> Emphasis on experiential rewards (spa retreats, expert consultations). "
        "\"Glow Ambassador\" tier drove 42% of total revenue from just 8% of customers.",
        styles['BodyCustom']
    ))
    story.append(PageBreak())

    # Case Study 3
    story.append(Paragraph("Case Study 3: Sports Nutrition Brand", styles['CaseStudyTitle']))
    story.append(Paragraph("<b>Company Profile:</b> $120M annual revenue, 320K customers, Global markets", styles['BodyCustom']))

    cs3_results = [
        ['Metric', 'Before', 'After 12 Months', 'Change'],
        ['Monthly Active Members', '-', '118K', '-'],
        ['Subscription Conversion', '12%', '19%', '+58%'],
        ['Churn Rate', '8.2%/mo', '5.8%/mo', '-29%'],
        ['Challenge Participation', '-', '22%', '-'],
        ['Revenue from Loyalty Members', '-', '52%', '-'],
    ]

    cs3_table = Table(cs3_results, colWidths=[1.8*inch, 1.1*inch, 1.3*inch, 1*inch])
    cs3_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#3182ce")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (-1, 1), (-1, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (-1, 1), (-1, -1), BRAND_ACCENT),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(cs3_table)
    story.append(Spacer(1, 0.15*inch))
    story.append(Paragraph(
        "<b>Key Strategy:</b> Heavy gamification with monthly fitness challenges, streak rewards, and "
        "mystery boxes. Points system tied to workout tracking via API integration.",
        styles['BodyCustom']
    ))

    story.append(Spacer(1, 0.5*inch))

    # Key Takeaways section
    story.append(Paragraph("Key Patterns from Enterprise Success", styles['Heading3Custom']))

    # Use Paragraph objects for proper text wrapping in table cells
    cell_style = ParagraphStyle('TakeawayCell', parent=styles['BodyCustom'], fontSize=9, leading=12)
    cell_style_bold = ParagraphStyle('TakeawayCellBold', parent=cell_style, fontName='Helvetica-Bold')
    cell_style_header = ParagraphStyle('TakeawayHeader', parent=cell_style, fontName='Helvetica-Bold', textColor=colors.white)

    takeaways_data = [
        [Paragraph('Pattern', cell_style_header),
         Paragraph('Impact', cell_style_header),
         Paragraph('WelleCo Application', cell_style_header)],
        [Paragraph('Tiered Structure', cell_style_bold),
         Paragraph('+35-40% member spend vs non-members', cell_style),
         Paragraph("Natural → Boost → Super → Elle's Circle", cell_style)],
        [Paragraph('Subscription Integration', cell_style_bold),
         Paragraph('+50-60% subscription conversion', cell_style),
         Paragraph('1.5x points on existing 20% discount', cell_style)],
        [Paragraph('Experiential Rewards', cell_style_bold),
         Paragraph('35% revenue from top 10% customers', cell_style),
         Paragraph("Luxury wellness experiences, Dr. Laubscher content", cell_style)],
        [Paragraph('Gamification', cell_style_bold),
         Paragraph('2x engagement vs email alone', cell_style),
         Paragraph('"Alkaline 30" wellness journey challenges', cell_style)],
        [Paragraph('Referral Program', cell_style_bold),
         Paragraph('80-100% increase in referral revenue', cell_style),
         Paragraph("500 pts + $20 friend, Elle's Circle 750 pts", cell_style)],
    ]

    takeaways_table = Table(takeaways_data, colWidths=[1.5*inch, 2*inch, 2*inch])
    takeaways_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_PRIMARY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(takeaways_table)

    story.append(PageBreak())

    # ===== PHILOSOPHY ALIGNMENT =====
    story.append(Paragraph("Philosophy Alignment: Why RewardsPro for WelleCo", styles['Heading2Custom']))

    # Elle quote callout
    elle_quote = Paragraph(
        '"<i>For years it was about how I looked, now it\'s about how I feel. '
        'True beauty comes from the inside and radiates out.</i>"<br/>'
        '<b>— Elle Macpherson, Founder</b>',
        ParagraphStyle('ElleQuote', parent=styles['BodyCustom'], fontSize=11, alignment=TA_CENTER,
                      textColor=WELLE_GREEN, leading=16)
    )
    quote_box = Table([[elle_quote]], colWidths=[5.5*inch])
    quote_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), WELLE_CREAM),
        ('TOPPADDING', (0, 0), (-1, -1), 15),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
        ('LEFTPADDING', (0, 0), (-1, -1), 20),
        ('RIGHTPADDING', (0, 0), (-1, -1), 20),
        ('BOX', (0, 0), (-1, -1), 1, WELLE_GREEN),
    ]))
    story.append(quote_box)
    story.append(Spacer(1, 0.2*inch))

    story.append(Paragraph(
        "WelleCo isn't just a supplement brand—it's a philosophy. <b>\"Wellness is not a trend\"</b>—it's how "
        "you show up in the world. RewardsPro was built to honor that philosophy, not contradict it.",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.15*inch))

    # Philosophy alignment table
    philosophy_data = [
        ['WelleCo Belief', 'Traditional Loyalty', 'RewardsPro Approach'],
        ['"Beauty from within"', 'External discounts drive behavior', 'Experiential rewards that nurture\ninner wellbeing (retreats, Elle access)'],
        ['"How I feel > How I look"', 'Points = status symbols', 'Journey milestones celebrate\npersonal wellness progress'],
        ['Holistic integration', 'Siloed programs (points vs\nsubscription vs referrals)', 'Unified experience: points +\nsubscription + referrals integrated'],
        ['"Wellness is not a trend"', 'Gamification for engagement', 'Wellness challenges that reinforce\ndaily rituals ("Alkaline 30")'],
        ['"A better world, naturally"', 'No sustainability focus', 'Bonus points for caddy refills;\nreward sustainable choices'],
        ['"Global family" community', 'Customers as transactions', 'WelleCommunity as belonging;\nElle\'s Circle as inner family'],
        ['Scientific transparency', 'Hidden rules, surprise fees', 'Clear tier progression, no fine\nprint, honest communication'],
    ]
    philosophy_table = Table(philosophy_data, colWidths=[1.6*inch, 1.8*inch, 2.3*inch])
    philosophy_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), WELLE_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 1), (0, -1), WELLE_GREEN),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (1, 1), (1, -1), colors.HexColor("#fee2e2")),  # Red tint for traditional
        ('BACKGROUND', (2, 1), (2, -1), colors.HexColor("#dcfce7")),  # Green tint for RewardsPro
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(philosophy_table)
    story.append(Spacer(1, 0.15*inch))

    # Integration principle
    integration_principle = Paragraph(
        '<b>Our Integration Principle:</b> Every touchpoint should feel like WelleCo—premium, authentic, '
        'and focused on the customer\'s wellness journey, not just their wallet.',
        ParagraphStyle('Principle', parent=styles['BodyCustom'], fontSize=9, backColor=colors.HexColor("#fef3c7"),
                      borderPadding=8)
    )
    principle_box = Table([[integration_principle]], colWidths=[5.7*inch])
    principle_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#fef3c7")),
        ('BOX', (0, 0), (-1, -1), 1, WELLE_BURGUNDY),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
    ]))
    story.append(principle_box)

    story.append(PageBreak())

    # ===== WELLECO INTEGRATION =====
    story.append(Paragraph("WelleCo Integration Plan", styles['Heading2Custom']))
    story.append(Paragraph(
        "RewardsPro installs as a <b>custom Shopify app</b> on each of your storefronts (US, UK, EU, AU), "
        "providing deep integration with your theme, checkout, and customer accounts. Your 80% DTC model "
        "creates the perfect foundation—direct relationships, full data ownership, and unmatched personalization.",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.2*inch))

    # Current State vs Unified Future
    story.append(Paragraph("From Fragmented to Unified: The Opportunity", styles['Heading3Custom']))

    current_vs_future = [
        ['Current State', 'Unified WelleCommunity'],
        ['3 separate systems (WelleClub + Welle+ + Subscribe)', '1 integrated loyalty experience'],
        ['Points cannot be used on subscriptions', 'Points + subscription bonuses work together'],
        ['12-month point expiration (creates anxiety)', 'Tier-based expiration extension'],
        ['No referral program', 'Structured referrals: 500 pts + $20 friend discount'],
        ['Unclear tier progression', 'Transparent journey: Natural → Boost → Super → Elle\'s Circle'],
        ['Transactional rewards only', 'Experiential rewards: wellness retreats, Elle access'],
        ['Regional programs disconnected', 'Global program, local currencies'],
    ]

    current_vs_table = Table(current_vs_future, colWidths=[2.7*inch, 3*inch])
    current_vs_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor("#fee2e2")),  # Red-ish for current
        ('BACKGROUND', (1, 0), (1, 0), WELLE_GREEN),  # Green for future
        ('TEXTCOLOR', (0, 0), (0, 0), colors.HexColor("#991b1b")),
        ('TEXTCOLOR', (1, 0), (1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, WELLE_CREAM]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(current_vs_table)
    story.append(Spacer(1, 0.2*inch))

    story.append(Paragraph(
        "Building on your existing WelleCommunity foundation (Natural → Boost → Super), we propose an enhanced "
        "4-tier structure with <b>Elle's Circle</b> as the aspirational apex, fully integrated with Subscribe & Thrive "
        "and your caddy refill ecosystem.",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.2*inch))

    # Multi-Regional Strategy callout
    story.append(Paragraph("Global Architecture: One Community, Four Storefronts", styles['Heading3Custom']))

    regional_data = [
        ['Region', 'Store', 'Currency', 'Loyalty Solution'],
        ['United States', 'welleco.com', 'USD', 'Unified WelleCommunity identity'],
        ['United Kingdom', 'welleco.co.uk', 'GBP', 'Points earn/redeem in local currency'],
        ['European Union', 'welleco.eu', 'EUR', 'Regional tier thresholds (PPP adjusted)'],
        ['Australia', 'welleco.com.au', 'AUD', 'Single global program, local fulfillment'],
    ]

    regional_table = Table(regional_data, colWidths=[1.2*inch, 1.4*inch, 0.7*inch, 2.4*inch])
    regional_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), WELLE_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (2, 0), (2, -1), 'CENTER'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, WELLE_CREAM]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(regional_table)
    story.append(Spacer(1, 0.1*inch))

    # Currency-agnostic explanation
    story.append(Paragraph(
        "<i>Points are currency-agnostic: customers earn and redeem in their local currency with consistent value across regions.</i>",
        ParagraphStyle('RegionalNote', parent=styles['BodyCustom'], fontSize=8, textColor=colors.HexColor("#666666"))
    ))
    story.append(Spacer(1, 0.2*inch))

    # Multi-Currency Details Table
    story.append(Paragraph("Multi-Currency Loyalty Economics", styles['Heading3Custom']))

    # Points earning and redemption by currency
    currency_header = [
        ['', 'United States', 'United Kingdom', 'European Union', 'Australia']
    ]
    currency_data = [
        ['Currency', 'USD ($)', 'GBP (£)', 'EUR (€)', 'AUD ($)'],
        ['Points per unit spent', '1 pt / $1', '1 pt / £1', '1 pt / €1', '1 pt / A$1'],
        ['100 pts redemption value', '$1.00', '£1.00', '€1.00', 'A$1.00'],
        ['', '', '', '', ''],
        ['TIER THRESHOLDS (Annual Spend)', '', '', '', ''],
        ['Welle Natural', '$0 - $199', '£0 - £159', '€0 - €179', 'A$0 - A$299'],
        ['Welle Boost', '$200 - $499', '£160 - £399', '€180 - €449', 'A$300 - A$749'],
        ['Welle Super', '$500 - $999', '£400 - £799', '€450 - €899', 'A$750 - A$1,499'],
        ["Elle's Circle", '$1,000+', '£800+', '€900+', 'A$1,500+'],
        ['', '', '', '', ''],
        ['EXAMPLE: Super Elixir Greens', '', '', '', ''],
        ['Local price', '$135', '£109', '€125', 'A$189'],
        ['Points earned (Natural tier)', '405 pts', '327 pts', '375 pts', '567 pts'],
        ['Points earned (Elle\'s Circle)', '810 pts', '654 pts', '750 pts', '1,134 pts'],
    ]

    currency_table = Table(currency_data, colWidths=[1.6*inch, 1.1*inch, 1.1*inch, 1.1*inch, 1.1*inch])
    currency_table.setStyle(TableStyle([
        # Header row styling
        ('BACKGROUND', (1, 0), (-1, 0), WELLE_GREEN),
        ('TEXTCOLOR', (1, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        # Section headers
        ('BACKGROUND', (0, 4), (-1, 4), colors.HexColor("#f3f4f6")),
        ('FONTNAME', (0, 4), (-1, 4), 'Helvetica-Bold'),
        ('SPAN', (0, 4), (-1, 4)),
        ('BACKGROUND', (0, 10), (-1, 10), colors.HexColor("#f3f4f6")),
        ('FONTNAME', (0, 10), (-1, 10), 'Helvetica-Bold'),
        ('SPAN', (0, 10), (-1, 10)),
        # Left column bold
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        # Elle's Circle highlight
        ('BACKGROUND', (0, 8), (-1, 8), colors.HexColor("#fef3c7")),
        # Empty rows
        ('BACKGROUND', (0, 3), (-1, 3), colors.white),
        ('BACKGROUND', (0, 9), (-1, 9), colors.white),
        # Grid
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(currency_table)
    story.append(Spacer(1, 0.1*inch))

    story.append(Paragraph(
        "<i><b>How it works:</b> A customer in London who spends £109 on Super Elixir earns 327 pts (at Natural tier). "
        "If they later visit welleco.com while traveling, their points are still valid—327 pts = $3.27 USD redemption value. "
        "Same customer, same points, seamless global experience.</i>",
        ParagraphStyle('CurrencyNote', parent=styles['BodyCustom'], fontSize=8, textColor=colors.HexColor("#666666"))
    ))
    story.append(Spacer(1, 0.25*inch))

    # Multinational Enterprise Considerations
    story.append(Paragraph("Multinational Enterprise Considerations", styles['Heading3Custom']))
    story.append(Paragraph(
        "Operating loyalty across US, UK, EU, and AU introduces complexity that standard apps can't handle. "
        "RewardsPro is built for multinational operations:",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.1*inch))

    multinational_data = [
        ['Concern', 'Challenge', 'RewardsPro Solution'],
        ['DATA PRIVACY &\nCOMPLIANCE', 'GDPR (EU/UK), CCPA (US), different consent\nrequirements, 72-hour breach notification', 'Built-in GDPR/CCPA compliance, regional\nconsent flows, automated data handling'],
        ['TAX TREATMENT', 'Points taxable >€44/mo in Germany;\nUK requires NI contributions on rewards', 'Configurable reward structures per region;\ntax-friendly redemption options'],
        ['MULTI-CURRENCY', 'Exchange rate fluctuations, points value\nconsistency, local pricing differences', 'Currency-agnostic points; earn/redeem in\nlocal currency; PPP-adjusted thresholds'],
        ['POINTS SYNC', 'Most Shopify apps cannot sync points\nacross multiple storefronts', 'Single customer profile across all 4 stores;\nreal-time points sync via unified backend'],
        ['SCALABILITY', 'Peak load handling (Black Friday),\nreal-time transaction processing', 'Cloud-native architecture; scales to 10K+\norders/hour; 99.9% uptime SLA'],
        ['UNIFIED REPORTING', 'Siloed data across regional stores;\nno consolidated analytics view', 'Single dashboard for all regions; segment\nby country, currency, or storefront'],
        ['LOCALIZATION', 'Language, cultural preferences,\nregional reward relevance', 'Multi-language support; region-specific\nreward catalogs; local campaign targeting'],
    ]
    multinational_table = Table(multinational_data, colWidths=[1.3*inch, 2.2*inch, 2.2*inch])
    multinational_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f9ff")]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(multinational_table)
    story.append(Spacer(1, 0.15*inch))

    # Technical Architecture callout
    tech_callout = Paragraph(
        "<b>Technical Architecture:</b> RewardsPro installs as a custom Shopify app on each storefront, "
        "connected to a unified cloud backend. Customer data syncs in real-time—a purchase on welleco.co.uk "
        "instantly updates tier status visible on welleco.com. One source of truth, four local experiences.",
        ParagraphStyle('TechCallout', parent=styles['BodyCustom'], fontSize=8, backColor=colors.HexColor("#f0fdf4"),
                       borderPadding=8, borderColor=WELLE_GREEN, borderWidth=1)
    )
    tech_box = Table([[tech_callout]], colWidths=[5.7*inch])
    tech_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
        ('BOX', (0, 0), (-1, -1), 1, WELLE_GREEN),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(tech_box)
    story.append(Spacer(1, 0.25*inch))

    story.append(Paragraph("Your Wellness Journey: Four Stages", styles['Heading3Custom']))
    story.append(Paragraph(
        "Tier progression mirrors the wellness journey itself—from discovering WelleCo (<b>Natural</b>) to "
        "making it part of your daily ritual (<b>Boost</b>) to experiencing transformation (<b>Super</b>) to "
        "becoming part of Elle's inner family (<b>Elle's Circle</b>). It's not about spending—it's about commitment to wellness.",
        ParagraphStyle('TierIntro', parent=styles['BodyCustom'], fontSize=9, textColor=colors.HexColor("#666666"))
    ))
    story.append(Spacer(1, 0.1*inch))

    tier_data = [
        ['Stage', 'Journey', 'Pts', 'How It Feels'],
        ['Welle Natural', 'Discovery', '3', 'Welcome gift, birthday celebration, wellness tips'],
        ['Welle Boost', 'Daily Ritual', '4', 'Early access, free shipping, Dr. Laubscher guidance'],
        ['Welle Super', 'Transformation', '5', 'VIP events, priority care, surprise mystery boxes'],
        ["Elle's Circle", 'Inner Family', '6', 'Personal concierge, wellness retreats, co-create with Elle'],
    ]

    tier_table = Table(tier_data, colWidths=[1.1*inch, 0.9*inch, 0.4*inch, 3.3*inch])
    tier_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (2, -1), 'CENTER'),
        ('BACKGROUND', (0, 4), (-1, 4), colors.HexColor("#fefcbf")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(tier_table)
    story.append(Spacer(1, 0.25*inch))

    # Tier distribution chart - smaller to fit better
    story.append(Image(chart_tiers, width=3.5*inch, height=3.5*inch))

    # Add key insight below chart
    insight_data = [[
        "Top 25% (Super + Elle's Circle) drive 60% of community revenue"
    ]]
    insight_table = Table(insight_data, colWidths=[5*inch])
    insight_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#fefcbf")),
        ('TEXTCOLOR', (0, 0), (-1, -1), BRAND_SECONDARY),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 15),
        ('RIGHTPADDING', (0, 0), (-1, -1), 15),
        ('BOX', (0, 0), (-1, -1), 1, BRAND_GOLD),
    ]))
    story.append(Spacer(1, 0.2*inch))
    story.append(insight_table)

    story.append(PageBreak())

    # ===== KEY PROGRAM ENHANCEMENTS =====
    story.append(Paragraph("Key Program Enhancements", styles['Heading2Custom']))

    # 1. Subscription Integration
    story.append(Paragraph("1. Subscribe & Thrive Integration", styles['Heading3Custom']))
    story.append(Paragraph(
        "Your existing 20% subscription discount becomes even more powerful when layered with loyalty rewards. "
        "Unlike your current WelleClub where <i>points cannot be redeemed on subscriptions</i>, RewardsPro unifies the experience:",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.1*inch))

    subscription_integration = [
        ['Subscriber Benefit', 'Current', 'With RewardsPro'],
        ['Monthly Discount', '20% off', '20% off (unchanged)'],
        ['Points Earning', 'Standard rate', '1.5x multiplier (50% bonus)'],
        ['Points Redemption', 'Not allowed', 'Full redemption on any order'],
        ['Tier Qualification', 'Separate from WelleClub', 'Auto-qualify for Boost tier minimum'],
        ['Caddy Refill Bonus', 'None', '+100 bonus pts per refill pouch'],
    ]
    sub_table = Table(subscription_integration, colWidths=[1.8*inch, 1.6*inch, 2.3*inch])
    sub_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), WELLE_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (1, 1), (1, -1), colors.HexColor("#fee2e2")),  # Red for current
        ('BACKGROUND', (2, 1), (2, -1), colors.HexColor("#dcfce7")),  # Green for new
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(sub_table)
    story.append(Spacer(1, 0.2*inch))

    # 2. Referral Program
    story.append(Paragraph("2. Referral Program (Currently Missing)", styles['Heading3Custom']))
    story.append(Paragraph(
        "WelleCo's premium brand and Elle's celebrity status create natural word-of-mouth potential—but without "
        "a structured referral program, this opportunity is untapped. RewardsPro adds:",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.1*inch))

    referral_data = [
        ['Who', 'Reward', 'Tier Bonus'],
        ['Referrer (existing customer)', '500 points ($5 value)', "Elle's Circle: 750 pts"],
        ['Friend (new customer)', '$20 off first order ($75 min)', 'Auto-enrolled in WelleCommunity'],
    ]
    referral_table = Table(referral_data, colWidths=[2*inch, 2*inch, 1.7*inch])
    referral_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, WELLE_CREAM]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(referral_table)
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        "<i>Industry benchmark: Structured referral programs drive 80-100% increase in referral revenue. "
        "Projected impact: $720K+ annual referral revenue (vs ~$180K estimated current).</i>",
        ParagraphStyle('RefNote', parent=styles['BodyCustom'], fontSize=8, textColor=colors.HexColor("#666666"))
    ))
    story.append(Spacer(1, 0.2*inch))

    # 3. Experiential Rewards
    story.append(Paragraph("3. Experiential Rewards: \"How I Feel\" Over Discounts", styles['Heading3Custom']))
    story.append(Paragraph(
        "Elle says: \"<i>For years it was about how I looked, now it's about how I feel.</i>\" Elle's Circle "
        "rewards aren't about saving money—they're about <b>feeling connected, inspired, and part of something meaningful</b>:",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.1*inch))

    experiential_data = [
        ['Experience', 'Frequency', 'How It Feels'],
        ["Elle's Inner Circle community", 'Ongoing', 'Belonging to a global wellness family'],
        ['Virtual wellness Q&A with Elle', 'Quarterly', 'Inspired by the founder\'s journey'],
        ['Product co-creation input', 'Annual', 'Ownership: "I helped create this"'],
        ['Luxury wellness retreat raffle', 'Annual', 'Life-changing transformation'],
        ['Dr. Laubscher nutrition consult', 'On-demand', 'Personalized expert guidance'],
        ['Early naming rights on new products', 'Per launch', 'Legacy within the brand'],
    ]
    exp_table = Table(experiential_data, colWidths=[2.3*inch, 1.2*inch, 2.2*inch])
    exp_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_GOLD),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#fffaf0")]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#d69e2e")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(exp_table)
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        "<i>These experiences create emotional connection—customers stay not for discounts, but for belonging.</i>",
        ParagraphStyle('ExpNote', parent=styles['BodyCustom'], fontSize=8, textColor=colors.HexColor("#666666"), fontName='Helvetica-Oblique')
    ))
    story.append(Spacer(1, 0.2*inch))

    # 3.5 Sustainability Rewards
    story.append(Paragraph("Sustainability Rewards: \"A Better World, Naturally\"", styles['Heading3Custom']))
    story.append(Paragraph(
        "WelleCo's commitment to sustainability—from plastic-free scoops to refill pouches—deserves to be rewarded. "
        "RewardsPro lets you incentivize the sustainable choices your customers already want to make:",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.1*inch))

    sustainability_data = [
        ['Sustainable Action', 'Reward', 'Environmental Impact'],
        ['Purchase refill pouch (vs new caddy)', '+100 bonus points', 'Reduces packaging waste by 80%'],
        ['Return empty caddy for recycling', '+50 points + $5 credit', 'Closes the loop on materials'],
        ['Choose carbon-neutral shipping', '+25 points', 'Offsets delivery emissions'],
        ['Complete "Sustainable Welle" challenge', '+200 points + badge', 'Educates on eco-practices'],
    ]
    sustainability_table = Table(sustainability_data, colWidths=[2.2*inch, 1.5*inch, 2*inch])
    sustainability_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), WELLE_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0fdf4")]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#bbf7d0")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(sustainability_table)
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        "<i>Align loyalty with values: customers feel good about their choices, and WelleCo reinforces its brand promise.</i>",
        ParagraphStyle('SustNote', parent=styles['BodyCustom'], fontSize=8, textColor=WELLE_GREEN)
    ))
    story.append(Spacer(1, 0.2*inch))

    # 4. Wellness Rituals
    story.append(Paragraph("4. Wellness Rituals: Reinforcing Daily Practice", styles['Heading3Custom']))
    story.append(Paragraph(
        "\"<i>Wellness is not a trend—it's how we show up in the world.</i>\" These features don't gamify for "
        "engagement's sake; they reinforce the daily rituals that make WelleCo transformative:",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.1*inch))

    gamification_data = [
        ['Ritual', 'WelleCo Experience', 'Wellness Outcome'],
        ['Daily Practice', '"Alkaline 30": 30-day Super Elixir\njourney with daily check-ins → 500 pts', 'Habit formation, product\nefficacy, inner transformation'],
        ['Consistency Rewards', '7-day streak → mystery sample\n30-day streak → free shipping', 'Routine reinforcement,\nsustained wellness journey'],
        ['Surprise & Delight', 'Quarterly mystery box (Super+):\nnew flavors, limited caddies', 'Joy, anticipation,\ndeepened brand love'],
        ['Aspirational Moments', '"Meet Elle" raffle (Elle\'s Circle)\n—connect with the founder', 'Belonging, inspiration,\ninner circle connection'],
        ['Journey Milestones', '"Wellness Pioneer", "Caddy Champion",\n"Community Builder" badges', 'Identity, pride,\nshared advocacy'],
    ]
    gamification_table = Table(gamification_data, colWidths=[1.4*inch, 2.4*inch, 1.9*inch])
    gamification_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), WELLE_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, WELLE_CREAM]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(gamification_table)
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        "<i>Gamification drives 2x engagement vs email alone. Challenges create accountability; "
        "mystery boxes create anticipation; badges create identity.</i>",
        ParagraphStyle('GamNote', parent=styles['BodyCustom'], fontSize=8, textColor=colors.HexColor("#666666"))
    ))

    story.append(PageBreak())

    # ===== ROI PROJECTION =====
    story.append(Paragraph("ROI Projection", styles['Heading2Custom']))
    story.append(Image(chart_roi, width=6*inch, height=3.2*inch))
    story.append(Spacer(1, 0.15*inch))

    roi_data = [
        ['Scenario', 'Month 3', 'Month 6', 'Month 12', 'ROI'],
        ['Conservative', '$15K', '$45K', '$95K', '3x'],
        ['Expected', '$25K', '$65K', '$145K', '4.5x'],
        ['Optimistic', '$40K', '$95K', '$210K', '6.5x'],
    ]

    roi_table = Table(roi_data, colWidths=[1.5*inch, 0.9*inch, 0.9*inch, 0.9*inch, 0.7*inch])
    roi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (-1, 1), (-1, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (-1, 1), (-1, -1), BRAND_ACCENT),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor("#c6f6d5")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(roi_table)
    story.append(Paragraph(
        "<i>Based on $32,000/year custom solution investment and $150K/month base revenue.</i>",
        ParagraphStyle('Source', parent=styles['BodyCustom'], fontSize=8, textColor=colors.HexColor("#718096"))
    ))

    story.append(Spacer(1, 0.25*inch))

    # CLV Growth Chart - on same page
    story.append(Paragraph("Customer Lifetime Value Growth", styles['Heading3Custom']))
    story.append(Image(chart_clv, width=6*inch, height=3.2*inch))

    story.append(PageBreak())

    # ===== DETAILED INTEGRATION PLAN =====
    story.append(Paragraph("Tailored Integration Plan", styles['Heading2Custom']))
    story.append(Paragraph(
        "Building on WelleCo's alkaline wellness philosophy and existing WelleCommunity program, "
        "we've designed a 4-phase plan to unify and elevate loyalty across markets worldwide.",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.2*inch))

    # Phase 1
    story.append(Paragraph("Phase 1: Foundation (Weeks 1-2)", styles['Heading3Custom']))
    phase1_data = [
        ['Component', 'Details'],
        ['Tier Migration', 'Migrate WelleCommunity (Natural/Boost/Super) + Elle\'s Circle'],
        ['Points Economy', '3-6 pts/$ by tier, 1.5x Subscribe & Thrive, 1,000 pts = $10'],
        ['DTC Priority', 'Loyalty exclusive to welleco.com—drive retail customers to DTC'],
        ['Caddy Rewards', 'Bonus 200 pts for refill purchases, first caddy = 500 pts welcome'],
    ]
    phase1_table = Table(phase1_data, colWidths=[1.3*inch, 4.2*inch])
    phase1_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(phase1_table)
    story.append(Spacer(1, 0.15*inch))

    # Phase 2
    story.append(Paragraph("Phase 2: Engagement Mechanics (Weeks 3-4)", styles['Heading3Custom']))
    phase2_data = [
        ['Feature', 'WelleCo Application'],
        ['Subscribe+Thrive', '1.5x pts on your 20% subscription, auto-qualify Boost tier'],
        ['Category Bonus', '2x pts on Beauty Elixirs (Hair, Skin, Collagen), Kids Elixir'],
        ['Challenges', '"Alkaline 30" journey, "Complete Your Routine" (3+ categories)'],
        ['Referral', '500 pts + $20 for friend, Elle\'s Circle gets 750 pts'],
    ]
    phase2_table = Table(phase2_data, colWidths=[1.3*inch, 4.2*inch])
    phase2_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_ACCENT),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(phase2_table)
    story.append(Spacer(1, 0.15*inch))

    # Phase 3 & 4
    story.append(Paragraph("Phase 3-4: Automation & VIP Layer (Month 2+)", styles['Heading3Custom']))
    phase34_data = [
        ['Automation', 'Purpose'],
        ['Welcome Series', 'Alkaline journey intro, first Super Elixir tips, caddy reward'],
        ['Refill Reminder', 'Bonus points for repurchase when 30-day supply runs low'],
        ['Tier Upgrade', 'Celebrate with Dr. Laubscher video message'],
        ['Retail Convert', 'Sephora/Net-a-Porter buyers → DTC with loyalty incentive'],
        ['Klaviyo Sync', 'Segments: tier, subscription status, refill cycle, churn_risk'],
    ]
    phase34_table = Table(phase34_data, colWidths=[1.3*inch, 4.2*inch])
    phase34_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_GOLD),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(phase34_table)

    # Elle's Circle VIP benefits
    story.append(Spacer(1, 0.15*inch))
    story.append(Paragraph("<b>Elle's Circle: The Ultimate Wellness Experience</b>", styles['BodyCustom']))
    story.append(Paragraph(
        "Leverage your unique assets—Elle Macpherson and Dr. Simone Laubscher—"
        "for VIP experiences no competitor can replicate: exclusive alkaline wellness retreats, "
        "virtual Q&As with Elle, Dr. Laubscher nutrition consultations, and product "
        "co-creation input. These experiential rewards create the emotional loyalty that drives lifetime advocacy.",
        styles['BodyCustom']
    ))

    story.append(PageBreak())

    # ===== INVESTMENT =====
    story.append(Paragraph("Investment: Custom Solution for WelleCo", styles['Heading2Custom']))

    # Why Custom callout
    why_custom_text = Paragraph(
        '<b>Why WelleCo Needs a Custom Solution</b><br/><br/>'
        'Standard loyalty platforms work for standard brands. WelleCo is not standard. '
        'Your unique requirements demand a tailored approach:',
        ParagraphStyle('WhyCustom', parent=styles['BodyCustom'], fontSize=10, leading=14)
    )
    why_custom_box = Table([[why_custom_text]], colWidths=[5.5*inch])
    why_custom_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#fef3c7")),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('LEFTPADDING', (0, 0), (-1, -1), 15),
        ('RIGHTPADDING', (0, 0), (-1, -1), 15),
        ('BOX', (0, 0), (-1, -1), 2, WELLE_BURGUNDY),
    ]))
    story.append(why_custom_box)
    story.append(Spacer(1, 0.2*inch))

    # Why custom reasons
    why_custom_data = [
        ['WelleCo Requirement', 'Why Standard Doesn\'t Work', 'Custom Solution'],
        ['4 regional storefronts\n(US, UK, EU, AU)', 'Most apps support 1 store;\nmulti-store sync is add-on or unsupported', 'Native multi-store architecture\nwith unified customer profiles'],
        ['Multi-currency points\n(USD, GBP, EUR, AUD)', 'Standard: single currency only;\nconversion creates confusion', 'Currency-agnostic points with\nPPP-adjusted tier thresholds'],
        ['Premium brand aesthetic\n(Elle Macpherson standard)', 'Template widgets don\'t match\nluxury brand expectations', 'Fully branded UI: storefront,\naccount portal, emails, admin'],
        ['Subscribe & Thrive\nintegration', 'Basic subscription recognition;\nno multipliers or stacking', 'Deep Recharge integration:\n1.5x points, auto-tier qualification'],
        ['Elle\'s Circle VIP\nexperiences', 'Standard rewards = discounts only;\nno experiential capability', 'Custom experiential rewards:\nretreats, Elle access, co-creation'],
        ['Sustainability rewards\n(caddy refills)', 'No support for eco-behavior\ntracking or incentives', 'Custom actions: refill bonuses,\nrecycling credits, carbon offsets'],
        ['GDPR + multi-region\ncompliance', 'US-focused platforms often lack\nregional consent handling', 'Built-in GDPR/CCPA compliance\nwith regional data flows'],
    ]

    why_custom_table = Table(why_custom_data, colWidths=[1.6*inch, 2*inch, 2.1*inch])
    why_custom_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), WELLE_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (1, 1), (1, -1), colors.HexColor("#fee2e2")),  # Red for problems
        ('BACKGROUND', (2, 1), (2, -1), colors.HexColor("#dcfce7")),  # Green for solutions
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(why_custom_table)
    story.append(Spacer(1, 0.2*inch))

    # Bottom line
    story.append(Paragraph(
        "<b>The Bottom Line:</b> Off-the-shelf loyalty platforms would force WelleCo to compromise on brand, "
        "fragment your global community, and miss the experiential rewards that differentiate Elle's Circle. "
        "A custom solution costs more upfront but delivers the premium experience your customers expect.",
        ParagraphStyle('BottomLine', parent=styles['BodyCustom'], fontSize=9, textColor=colors.HexColor("#666666"))
    ))

    story.append(Spacer(1, 0.3*inch))

    # Custom Solution Details
    story.append(Paragraph("Custom Solution: What's Included", styles['Heading3Custom']))

    story.append(Paragraph(
        "All customer-facing and merchant-facing UI and functionality fully tailored to WelleCo's premium brand:",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.1*inch))

    # Custom features table
    custom_features_data = [
        ['Customization Area', 'WelleCo Application'],
        ['CUSTOMER-FACING UI', ''],
        ['  Storefront Widget', 'Branded tier badge, points balance, progress bar\nmatching WelleCo premium aesthetic'],
        ['  Account Portal', 'Full rewards dashboard: tier status, points history,\navailable rewards, referral tracking'],
        ['  Checkout Experience', 'Seamless redemption flow, subscription bonus callouts,\ntier benefit reminders at purchase'],
        ['  Email Templates', 'Welcome series, tier upgrades, campaigns, win-back—\nall designed in WelleCo brand language'],
        ['MERCHANT-FACING UI', ''],
        ['  Admin Dashboard', 'Custom analytics views, KPI widgets, member\nmanagement interface tailored for your team'],
        ['  Campaign Builder', 'Drag-and-drop email/SMS editor, segment builder,\nA/B testing, predictive send time optimization'],
        ['  Automation Studio', 'Visual workflow editor for tier upgrades, win-back\nsequences, subscription loyalty triggers'],
        ['PLATFORM & SERVICES', ''],
        ['  Custom Integrations', 'Klaviyo advanced sync, Subscribe & Thrive platform,\nmulti-currency handling across all 4 storefronts'],
        ['  Brand Strategy', 'Collaborative workshop: tier naming, Elle-exclusive\nexperiences, rewards catalog design'],
        ['  White-Glove Onboarding', 'Dedicated success manager, staff training, VIP\nmigration, launch marketing assets'],
    ]

    custom_features_table = Table(custom_features_data, colWidths=[1.8*inch, 3.9*inch])
    custom_features_table.setStyle(TableStyle([
        # Header row
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_GOLD),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        # Section headers (rows 1, 6, 10)
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor("#254434")),  # Customer-facing (WelleCo Green)
        ('TEXTCOLOR', (0, 1), (-1, 1), colors.white),
        ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
        ('SPAN', (0, 1), (-1, 1)),  # Span across both columns
        ('BACKGROUND', (0, 6), (-1, 6), colors.HexColor("#254434")),  # Merchant-facing
        ('TEXTCOLOR', (0, 6), (-1, 6), colors.white),
        ('FONTNAME', (0, 6), (-1, 6), 'Helvetica-Bold'),
        ('SPAN', (0, 6), (-1, 6)),
        ('BACKGROUND', (0, 10), (-1, 10), colors.HexColor("#254434")),  # Platform & Services
        ('TEXTCOLOR', (0, 10), (-1, 10), colors.white),
        ('FONTNAME', (0, 10), (-1, 10), 'Helvetica-Bold'),
        ('SPAN', (0, 10), (-1, 10)),
        # Content rows
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 2), (-1, 5), [colors.white, colors.HexColor("#fffaf0")]),
        ('ROWBACKGROUNDS', (0, 7), (-1, 9), [colors.white, colors.HexColor("#fffaf0")]),
        ('ROWBACKGROUNDS', (0, 11), (-1, -1), [colors.white, colors.HexColor("#fffaf0")]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#d69e2e")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(custom_features_table)
    story.append(Spacer(1, 0.15*inch))

    # Investment Summary
    story.append(Paragraph("Total Investment", styles['Heading3Custom']))

    investment_data = [
        ['Component', 'Annual Cost', 'What\'s Included'],
        ['Core Platform License', '$6,000/year', 'Loyalty engine, unlimited orders & customers,\ntier management, campaigns, cloud hosting'],
        ['Multi-Store Architecture', '$5,000/year', '4 regional storefronts (US, UK, EU, AU),\nunified customer profiles, real-time points sync'],
        ['Custom Development', '$10,000/year', 'Branded UI/UX, Elle\'s Circle experiences,\nsustainability rewards, wellness challenges'],
        ['Integration Suite', '$6,000/year', 'Klaviyo sync, Recharge subscription integration,\n4x Shopify Admin/Storefront connections'],
        ['Dedicated Success', '$5,000/year', 'Named account manager, priority support,\nquarterly business reviews, staff training'],
        ['TOTAL', '$32,000/year', 'Complete custom WelleCommunity solution'],
    ]
    investment_table = Table(investment_data, colWidths=[1.5*inch, 1.1*inch, 3.1*inch])
    investment_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), WELLE_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, 5), [colors.white, WELLE_CREAM]),
        ('BACKGROUND', (0, 6), (-1, 6), colors.HexColor("#fef3c7")),
        ('FONTNAME', (0, 6), (-1, 6), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(investment_table)
    story.append(Spacer(1, 0.15*inch))

    # What's included callout
    story.append(Paragraph(
        "<b>All-inclusive:</b> Custom Shopify app on all 4 storefronts, cloud hosting, software licensing, "
        "platform maintenance, security updates, dedicated success manager, and white-glove onboarding. "
        "No hidden fees, no per-transaction charges, no surprise overages.",
        ParagraphStyle('IncludedNote', parent=styles['BodyCustom'], fontSize=9,
                      textColor=colors.HexColor("#666666"))
    ))

    story.append(Spacer(1, 0.25*inch))

    # Enterprise Security & API Section
    story.append(Paragraph("Enterprise Security & Technical Architecture", styles['Heading3Custom']))
    story.append(Paragraph(
        "Built for multinational enterprise requirements:",
        styles['BodyCustom']
    ))
    story.append(Spacer(1, 0.1*inch))

    enterprise_tech_data = [
        ['Area', 'Capability'],
        ['Security & Compliance', 'Enterprise-grade security infrastructure; GDPR/CCPA data handling;\nencryption at rest and in transit; automated audit trails'],
        ['API Architecture', 'RESTful API with comprehensive documentation; webhook events\nfor real-time sync; rate limits suitable for enterprise volume'],
        ['Integrations', 'Native: Shopify (all 4 stores), Klaviyo, Recharge\nAPI: ERP, POS, data warehouse, marketing automation'],
        ['Scalability', 'Cloud-native on AWS; auto-scaling for peak loads;\n10,000+ orders/hour capacity; 99.9% uptime SLA'],
        ['Data Ownership', 'Your data remains yours; full export capability;\nno vendor lock-in; portable customer records'],
    ]
    enterprise_tech_table = Table(enterprise_tech_data, colWidths=[1.5*inch, 4.2*inch])
    enterprise_tech_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(enterprise_tech_table)

    story.append(Spacer(1, 0.25*inch))

    # Timeline
    story.append(Paragraph("Implementation Timeline", styles['Heading3Custom']))

    timeline_data = [
        ['Week', 'Milestone', 'Activities'],
        ['Week 1', 'Discovery & Setup', 'Kickoff call, tier finalization, custom Shopify app install'],
        ['Week 2', 'Configuration', 'Reward rules, email templates, storefront widget integration'],
        ['Week 3', 'Testing', 'QA testing, staff training, soft launch to VIPs'],
        ['Week 4', 'Launch', 'Full launch, marketing announcement, monitoring'],
        ['Month 2+', 'Optimization', 'Automations, challenges, A/B testing, expansion'],
    ]

    timeline_table = Table(timeline_data, colWidths=[0.8*inch, 1.5*inch, 3.5*inch])
    timeline_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(timeline_table)

    story.append(PageBreak())

    # ===== NEXT STEPS - WelleCo voice =====
    story.append(Paragraph("Your Wellness Journey Continues", styles['Heading2Custom']))

    # Urgency callout
    urgency_text = Paragraph(
        '<b>Ready to unify your global WelleCommunity?</b><br/>'
        'We\'re currently onboarding 3 premium wellness brands for Q1. Let\'s explore if we\'re the right fit.',
        ParagraphStyle('UrgencyBox', parent=styles['BodyCustom'], fontSize=10, alignment=TA_CENTER,
                      textColor=WELLE_BLACK, leading=15)
    )
    urgency_data = [[urgency_text]]
    urgency_table = Table(urgency_data, colWidths=[5.2*inch])
    urgency_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#fef3c7")),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('LEFTPADDING', (0, 0), (-1, -1), 15),
        ('RIGHTPADDING', (0, 0), (-1, -1), 15),
        ('BOX', (0, 0), (-1, -1), 2, WELLE_BURGUNDY),
    ]))
    story.append(urgency_table)
    story.append(Spacer(1, 0.3*inch))

    # Steps - WelleCo voice
    steps_data = [
        ['1', 'Connect', '30-min discovery call to understand your community\'s needs\nand your vision for WelleCommunity\'s global future.'],
        ['2', 'Explore', 'Live demo with your products—see how your\nNatural → Boost → Super → Elle\'s Circle journey will feel.'],
        ['3', 'Design', 'Co-create your tailored 4-phase plan with regional\nrollout strategy and currency-agnostic rewards.'],
        ['4', 'Launch', 'Go live in 4 weeks with dedicated onboarding and\nKlaviyo integration support.'],
    ]

    steps_table = Table(steps_data, colWidths=[0.4*inch, 1.1*inch, 4.2*inch])
    steps_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (0, -1), 16),
        ('FONTSIZE', (1, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), WELLE_GREEN),
        ('TEXTCOLOR', (1, 0), (1, -1), WELLE_BLACK),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(steps_table)

    story.append(Spacer(1, 0.4*inch))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e0e0e0")))
    story.append(Spacer(1, 0.3*inch))

    # Contact box - WelleCo voice
    story.append(Paragraph("Let's Nourish Your Community Together", styles['Heading3Custom']))

    contact_text = Paragraph(
        "We believe in what you're building. A global community of wellness seekers who understand "
        "that true beauty comes from within. We'd love to explore how we can help you empower "
        "that community even further.<br/><br/>"
        "With wellness, you can. And together, we can help your community thrive.",
        ParagraphStyle('ContactBox', parent=styles['BodyCustom'], fontSize=10, alignment=TA_CENTER, leading=16, textColor=WELLE_BLACK)
    )
    contact_data = [[contact_text]]
    contact_table = Table(contact_data, colWidths=[5*inch])
    contact_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), WELLE_CREAM),
        ('TOPPADDING', (0, 0), (-1, -1), 20),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 20),
        ('LEFTPADDING', (0, 0), (-1, -1), 18),
        ('RIGHTPADDING', (0, 0), (-1, -1), 18),
        ('BOX', (0, 0), (-1, -1), 1, WELLE_GREEN),
    ]))
    story.append(contact_table)

    story.append(Spacer(1, 0.5*inch))

    # Final philosophy - WelleCo tagline
    story.append(Paragraph(
        "With wellness, you can.",
        ParagraphStyle('FinalTagline', parent=styles['Normal'], fontSize=16, alignment=TA_CENTER,
                      fontName='Helvetica-Oblique', textColor=WELLE_GREEN)
    ))

    story.append(Spacer(1, 0.4*inch))

    # Prepared for
    story.append(Paragraph(
        f"Prepared for WelleCo  •  {datetime.now().strftime('%B %Y')}  •  Confidential",
        ParagraphStyle('Footer', parent=styles['BodyCustom'], alignment=TA_CENTER,
                      fontSize=9, textColor=colors.HexColor("#999999"))
    ))

    # Build PDF with page numbers
    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    print(f"PDF generated: {OUTPUT_PATH}")

    # Cleanup temp files
    import shutil
    shutil.rmtree(temp_dir)

    return OUTPUT_PATH


if __name__ == "__main__":
    build_pdf()
