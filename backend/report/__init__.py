"""Phase 7.2 财富报告生成系统。

    templates.py  四个可复用模板段（退休/资产/现金流/投资风险）
    generator.py  报告生成（月度/年度/人生规划/投资分析）
    exporters.py  Markdown / HTML / PDF 导出

对外：backend.report.api.router（FastAPI 路由，prefix=/reports）
"""
