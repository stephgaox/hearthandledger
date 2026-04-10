from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./familybudget.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

# Enable FK enforcement for SQLite
if "sqlite" in DATABASE_URL:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_column_if_missing(conn, stmt: str):
    try:
        conn.execute(text(stmt))
        conn.commit()
    except OperationalError:
        pass  # column already exists


def create_tables():
    from models import Account, Transaction, Category  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Safe migrations — run on every startup, silently skip if already applied
    with engine.connect() as conn:
        _add_column_if_missing(conn, "ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id)")
        _add_column_if_missing(conn, "ALTER TABLE transactions ADD COLUMN file_hash TEXT")

        # Remove exact duplicates: same (date, description, amount, account_id) — keep lowest id
        conn.execute(text("""
            DELETE FROM transactions
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM transactions
                GROUP BY date, description, amount, account_id
            )
        """))

        # Rename "Transportation" → "Car" in existing data
        conn.execute(text("UPDATE transactions SET category = 'Car' WHERE category = 'Transportation'"))
        conn.execute(text("UPDATE categories SET name = 'Car' WHERE name = 'Transportation'"))

        # Re-tone category colors to harmonious warm-earthy palette
        for name, color in [
            ("Food & Dining",    "#c0522a"),
            ("Groceries",        "#4a7c59"),
            ("Kids & Childcare", "#c07838"),
            ("Car",              "#5a7a8a"),
            ("Entertainment",    "#7a5a82"),
            ("Shopping",         "#b07030"),
            ("Home",             "#7a5c3a"),
            ("Subscriptions",    "#2a8a82"),
            ("Medical",          "#9a4848"),
            ("Education",        "#6b7a3e"),
            ("Travel",           "#9a7248"),
            ("Pet",              "#b88820"),
            ("Bills & Utilities","#6a7888"),
            ("Income",           "#357a52"),
            ("Refund",           "#5a7a4a"),
            ("Other",            "#a89268"),
            ("Transfer",         "#8a9aaa"),
            ("Withdraw",         "#8a5a3a"),
            ("CC Payments",      "#5a7a9a"),
            ("Payment Received", "#6a8872"),
        ]:
            conn.execute(text(
                "UPDATE categories SET color = :color WHERE name = :name"
            ), {"color": color, "name": name})

        # Ensure all amounts are positive (abs value convention).
        # Negative amounts are a parse artifact — type/category conveys direction.
        conn.execute(text("UPDATE transactions SET amount = ABS(amount) WHERE amount < 0"))

        # Re-tone vivid legacy generic system defaults
        conn.execute(text("UPDATE accounts SET color = '#8a9aaa' WHERE color = '#3b82f6'"))
        conn.execute(text("UPDATE categories SET color = '#a89268' WHERE color = '#6b7280'"))

        conn.commit()

    # Seed categories table if empty
    from models import Category as CatModel
    DEFAULT_CATEGORIES = [
        ("Food & Dining",    "#c0522a", 0),  # brick orange-red — appetite
        ("Groceries",        "#4a7c59", 1),  # forest green — fresh produce
        ("Kids & Childcare", "#c07838", 2),  # warm copper — nurturing
        ("Car",              "#5a7a8a", 3),  # steel blue-gray — automotive
        ("Entertainment",    "#7a5a82", 4),  # plum-mauve — culture & leisure
        ("Shopping",         "#b07030", 5),  # amber-copper — commerce
        ("Home",             "#7a5c3a", 6),  # oak brown — dwelling
        ("Subscriptions",    "#2a8a82", 7),  # deep teal — digital services
        ("Medical",          "#9a4848", 8),  # dusty crimson — health (distinct from Food)
        ("Education",        "#6b7a3e", 9),  # olive green — learning
        ("Travel",           "#9a7248", 10), # warm sand — wanderlust
        ("Pet",              "#b88820", 11), # warm gold — animal companions
        ("Bills & Utilities","#6a7888", 12), # slate blue-gray — utilities
        ("Income",           "#357a52", 13), # deep forest — money in (distinct from Groceries)
        ("Refund",           "#5a7a4a", 14), # sage green — credit
        ("Other",            "#a89268", 15), # light sienna — catchall
    ]
    seed_db = SessionLocal()
    try:
        if seed_db.query(CatModel).count() == 0:
            for name, color, order in DEFAULT_CATEGORIES:
                seed_db.add(CatModel(name=name, color=color, sort_order=order))
            seed_db.commit()
        # Always ensure Transfer and Withdraw exist for existing DBs
        for name, color, order in [
            ("Transfer",         "#8a9aaa", 16), # cool blue-gray — neutral movement
            ("Withdraw",         "#8a5a3a", 17), # warm sienna — money out (fits palette)
            ("CC Payments",      "#5a7a9a", 18), # muted navy — payment
            ("Payment Received", "#6a8872", 19), # muted green-gray — incoming (distinct from Transfer)
        ]:
            if not seed_db.query(CatModel).filter(CatModel.name == name).first():
                seed_db.add(CatModel(name=name, color=color, sort_order=order))
        seed_db.commit()
    finally:
        seed_db.close()
