from app.cli import ownlog
from export_runtime.index_writer import IndexWriter

__all__ = ['IndexWriter', 'ownlog']

if __name__ == '__main__':
    ownlog()
