import uvicorn
import sys
import os

if __name__ == "__main__":
    # Add parent directory to path so app package can be imported
    sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
    
    # Run FastAPI
    print("Starting Sensor Failure Recovery Backend on http://127.0.0.1:8000...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)
