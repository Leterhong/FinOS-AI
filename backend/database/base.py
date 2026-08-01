"""SQLAlchemy Declarative Base（所有模型共用）。"""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
