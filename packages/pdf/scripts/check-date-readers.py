"""Optional real-reader date regression; no installs. Pass a PDF and literal ranges.

DATE_READER_PYTHON selects a local Python environment in the calling integration test.
PDFBOX_JAR selects a locally supplied PDFBox app jar; Java must also be on PATH.
Unavailable readers print SKIP; installed readers' errors and wrong dates fail.
"""

import importlib.util
import os
import re
import shutil
import subprocess
import sys


def check(reader, text, expected):
    # Strip only bidi controls, never repair whitespace, punctuation or endpoint order.
    text = re.sub(r"[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", text)
    missing = [value for value in expected if not re.search(r"(?<![\d/])" + re.escape(value) + r"(?![\d/])", text)]
    if missing:
        raise AssertionError(f"{reader}: missing/changed ranges {missing!r}; extracted {text!r}")
    print(f"PASS {reader}: {len(expected)} closed numeric ranges")


def main():
    filename, *expected = sys.argv[1:]
    if not expected:
        raise ValueError("Usage: check-date-readers.py file.pdf start-end [start-end ...]")

    if importlib.util.find_spec("pypdfium2"):
        import pypdfium2

        with pypdfium2.PdfDocument(filename) as document:
            text = "\n".join(page.get_textpage().get_text_bounded() for page in document)
        check("PDFium", text, expected)
    else:
        print("SKIP PDFium: pypdfium2 is not installed in this Python environment")

    if importlib.util.find_spec("pdfminer") and importlib.util.find_spec("bidi"):
        from bidi.algorithm import get_display
        from pdfminer.high_level import extract_text

        text = "\n".join(
            get_display(line, base_dir="R") if re.search(r"[\u0600-\u06ff]", line) else line
            for line in extract_text(filename).split("\n")
        )
        check("pdfminer.six + bidi", text, expected)
    else:
        print("SKIP pdfminer.six + bidi: pdfminer and python-bidi must both be installed")

    jar = os.environ.get("PDFBOX_JAR")
    if jar and os.path.isfile(jar) and shutil.which("java"):
        for options in [[], ["-sort"]]:
            result = subprocess.run(
                ["java", "-jar", jar, "export:text", "-console", *options, "-i", filename],
                check=True, capture_output=True, text=True, timeout=60,
            )
            check("PDFBox" + (" -sort" if options else ""), result.stdout, expected)
    else:
        print("SKIP PDFBox: set PDFBOX_JAR to a local PDFBox app jar and provide Java on PATH")


if __name__ == "__main__":
    main()
