# app.py

import sqlite3
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify, redirect, url_for

app = Flask(__name__)

# --- DATABASE SETUP ---
DATABASE = 'instance/emergencylink.db'

def get_db_connection():
    """Connects to the SQLite database."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row  # Allows us to access columns by name
    return conn

def init_db():
    """Creates the database and tables if they don't exist."""
    import os
    os.makedirs('instance', exist_ok=True) # Ensure the instance folder exists
    
    conn = get_db_connection()
    
    # 1. Create the emergencies table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS emergencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emergency_id TEXT UNIQUE NOT NULL,
            emergency_type TEXT NOT NULL,
            description TEXT,
            user_name TEXT,
            phone TEXT NOT NULL,
            latitude REAL,
            longitude REAL,
            status TEXT DEFAULT 'REQUESTED',
            created_at TEXT NOT NULL
        )
    ''')

    # 2. Create the follow_ups table (Must be BEFORE conn.close())
    conn.execute('''
        CREATE TABLE IF NOT EXISTS follow_ups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emergency_id TEXT NOT NULL,
            message TEXT NOT NULL,
            sender TEXT DEFAULT 'CITIZEN',
            created_at TEXT NOT NULL,
            FOREIGN KEY (emergency_id) REFERENCES emergencies(emergency_id)
        )
    ''')
    
    # 3. Save changes and close the connection
    conn.commit()
    conn.close()


# --- ROUTES ---

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/emergency')
def emergency_page():
    return render_template('emergency.html')

@app.route('/submit_emergency', methods=['POST'])
def submit_emergency():
    """Receives form data and saves it to the database."""
    data = request.json  # We will send data as JSON from JavaScript
    
    # Generate a unique emergency ID (e.g., EMG-8F3A2B)
    unique_id = "EMG-" + uuid.uuid4().hex[:6].upper()
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        conn = get_db_connection()
        conn.execute('''
            INSERT INTO emergencies 
            (emergency_id, emergency_type, description, user_name, phone, latitude, longitude, created_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED')
        ''', (
            unique_id,
            data.get('type'),
            data.get('description'),
            data.get('name'),
            data.get('phone'),
            data.get('latitude'),
            data.get('longitude'),
            current_time
        ))
        conn.commit()
        conn.close()
        
        # Return success and the new ID to the frontend
        return jsonify({"success": True, "emergency_id": unique_id})
    
    except Exception as e:
        print("Database error:", e)
        return jsonify({"success": False, "error": "Failed to save emergency"}), 500

@app.route('/confirmation/<emergency_id>')
def confirmation(emergency_id):
    """Shows the confirmation page with the actual emergency details."""
    conn = get_db_connection()
    # Fetch the specific emergency from the database
    emergency = conn.execute('SELECT * FROM emergencies WHERE emergency_id = ?', (emergency_id,)).fetchone()
    conn.close()
    
    if emergency:
        # Pass the 'emergency' object to the template
        return render_template('confirmation.html', emergency=emergency)
    else:
        return "Emergency not found", 404

# ... (keep previous imports and code) ...

@app.route('/responder/login')
def responder_login():
    return render_template('responder_login.html')

@app.route('/dashboard')
def dashboard():
    """Renders the responder dashboard."""
    return render_template('dashboard.html')

@app.route('/api/emergencies')
def get_emergencies():
    """API endpoint to fetch all emergencies for the dashboard."""
    conn = get_db_connection()
    # Fetch all emergencies, ordered by newest first
    emergencies = conn.execute('SELECT * FROM emergencies ORDER BY created_at DESC').fetchall()
    conn.close()
    
    # Convert rows to a list of dictionaries so JavaScript can read them easily
    result = []
    for e in emergencies:
        result.append({
            'id': e['id'],
            'emergency_id': e['emergency_id'],
            'type': e['emergency_type'],
            'description': e['description'],
            'user_name': e['user_name'],
            'phone': e['phone'],
            'latitude': e['latitude'],
            'longitude': e['longitude'],
            'status': e['status'],
            'created_at': e['created_at']
        })
        
    return jsonify(result)

@app.route('/update_status', methods=['POST'])
def update_status():
    """Updates the status of an emergency."""
    data = request.json
    emergency_id = data.get('id')
    new_status = data.get('status')
    
    conn = get_db_connection()
    conn.execute('UPDATE emergencies SET status = ? WHERE id = ?', (new_status, emergency_id))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})

@app.route('/api/follow_ups/<emergency_id>')
def get_follow_ups(emergency_id):
    """Fetch all follow-up messages for an emergency."""
    conn = get_db_connection()
    msgs = conn.execute(
        'SELECT * FROM follow_ups WHERE emergency_id = ? ORDER BY created_at ASC', 
        (emergency_id,)
    ).fetchall()
    conn.close()
    
    result = [{'message': m['message'], 'sender': m['sender'], 'created_at': m['created_at']} for m in msgs]
    return jsonify(result)

@app.route('/submit_follow_up', methods=['POST'])
def submit_follow_up():
    """Save a new follow-up message from citizen or responder."""
    data = request.json
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        conn = get_db_connection()
        conn.execute('''
            INSERT INTO follow_ups (emergency_id, message, sender, created_at)
            VALUES (?, ?, ?, ?)
        ''', (data.get('emergency_id'), data.get('message'), data.get('sender', 'CITIZEN'), current_time))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        print("Follow-up error:", e)
        return jsonify({"success": False}), 500

# ... (keep the if __name__ == '__main__' block at the end) ...

# --- START THE SERVER ---
if __name__ == '__main__':
    app.run(debug=True)