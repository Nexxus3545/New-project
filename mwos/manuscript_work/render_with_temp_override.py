import os
import runpy
import sys
import tempfile


def main() -> None:
    override_temp = r"C:\tmp"
    os.environ["TEMP"] = override_temp
    os.environ["TMP"] = override_temp
    os.environ["TMPDIR"] = override_temp
    os.environ["HOME"] = override_temp
    tempfile.tempdir = override_temp

    if len(sys.argv) < 3:
        raise SystemExit(
            "Usage: render_with_temp_override.py INPUT_DOCX OUTPUT_DIR [--emit_pdf] [--verbose]"
        )

    render_script = (
        r"C:\Users\windows-11\.codex\plugins\cache\openai-primary-runtime"
        r"\documents\26.630.12135\skills\documents\render_docx.py"
    )

    sys.argv = [render_script, sys.argv[1], "--output_dir", sys.argv[2], *sys.argv[3:]]
    runpy.run_path(render_script, run_name="__main__")


if __name__ == "__main__":
    main()
