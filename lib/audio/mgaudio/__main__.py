"""python3 -m mgaudio out/audio.wav [--png spec.png] [--hits 1.2,4.8] [--dur 10]  -> QC report."""
from .qc import main

main()
