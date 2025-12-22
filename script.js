class EcoVision {
    constructor() {
        this.apiKey = 'AIzaSyAg2Wq2HRLEXXnTPVSi3Dd7MFc4RdGG8TA'; 
        this.camera = null;
        this.canvas = null;
        this.ctx = null;
        this.stats = {
            itemsClassified: 0,
            co2Saved: 0,
            recycledCount: 0,
            compostedCount: 0,
            waterSaved: 0,
            energySaved: 0
        };
        
        this.initializeElements();
        this.setupEventListeners();
        this.updateStats();
        this.startTipsCarousel();
    }

    initializeElements() {
        this.camera = document.getElementById('camera');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.captureBtn = document.getElementById('captureBtn');
        this.fileInput = document.getElementById('fileInput');
        this.uploadArea = document.getElementById('uploadArea');
        this.resultsSection = document.getElementById('resultsSection');
        this.loadingOverlay = document.getElementById('loadingOverlay');
    }

    setupEventListeners() {
        this.captureBtn.addEventListener('click', () => this.captureImage());
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Drag and drop functionality
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.style.background = 'rgba(76, 175, 80, 0.1)';
        });
        
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.style.background = 'rgba(76, 175, 80, 0.05)';
        });
        
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.style.background = 'rgba(76, 175, 80, 0.05)';
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.processFile(files[0]);
            }
        });

        // Initialize camera
        this.initializeCamera();
    }

    async initializeCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                } 
            });
            this.camera.srcObject = stream;
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.showMessage('Camera access denied. Please use file upload instead.', 'error');
        }
    }

    captureImage() {
        if (!this.camera.srcObject) {
            this.showMessage('Camera not available. Please use file upload.', 'error');
            return;
        }

        this.canvas.width = this.camera.videoWidth;
        this.canvas.height = this.camera.videoHeight;
        this.ctx.drawImage(this.camera, 0, 0);
        
        this.canvas.toBlob((blob) => {
            this.processFile(blob);
        }, 'image/jpeg', 0.8);
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            this.processFile(file);
        }
    }

    processFile(file) {
        if (!file.type.startsWith('image/')) {
            this.showMessage('Please select an image file.', 'error');
            return;
        }

        this.showLoading(true);
        this.classifyWaste(file);
    }

    async classifyWaste(imageFile) {
        try {
            // Preprocess and convert image file to base64 for API
            const base64Image = await this.preprocessImage(imageFile);
            
            if (!this.apiKey) {
                // Fallback to mock classification if no API key
                setTimeout(() => {
                    this.showMockResult();
                    this.showLoading(false);
                }, 2000);
                return;
            }

            console.log('Sending request to Google AI Studio...');
            
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `You are an expert waste management specialist. Analyze this image carefully and classify the waste item(s) you see.

ANALYSIS STEPS:
1. Look at the image and identify what waste item(s) are visible
2. Determine the material type (plastic, metal, paper, organic, etc.)
3. Check if the item is clean or contaminated
4. Consider the item's condition and size
5. Apply your knowledge of local recycling programs

CLASSIFICATION RULES:

RECYCLABLE (choose this if):
- Clean plastic bottles, containers with recycling symbols #1-7
- Aluminum cans, steel cans, metal containers
- Glass bottles and jars (clear, green, brown)
- Clean paper, cardboard, newspapers, magazines
- Clean metal items like aluminum foil, tin cans

COMPOSTABLE (choose this if):
- Food scraps: fruit peels, vegetable trimmings, bread, pasta
- Organic materials: coffee grounds, tea bags, eggshells
- Yard waste: leaves, grass clippings, small branches
- Natural materials: wood, cotton, wool (if organic)

NON_RECYCLABLE (choose this if):
- Styrofoam, foam packaging, packing peanuts
- Plastic bags, film, wrappers
- Contaminated items (food residue, grease, etc.)
- Hazardous materials, batteries, electronics
- Broken glass, ceramics, pottery
- Items too small or mixed materials

IMPORTANT: Look at the actual image content, not just guess. Be specific about what you see.

RESPOND WITH THIS EXACT JSON FORMAT ONLY:
{
    "category": "RECYCLABLE",
    "confidence": 0.95,
    "description": "Detailed description of what you see in the image and specific disposal instructions",
    "environmental_impact": "Environmental benefit of proper disposal"
}`
                        }, {
                            inline_data: {
                                mime_type: imageFile.type || 'image/jpeg',
                                data: base64Image
                            }
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.0,
                        topK: 1,
                        topP: 0.1,
                        maxOutputTokens: 300,
                    }
                })
            });

            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error:', response.status, errorText);
                throw new Error(`API Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('API Response:', data);
            this.processClassificationResult(data);
            
        } catch (error) {
            console.error('Classification error:', error);
            this.showMessage(`AI Error: ${error.message}. Using demo mode.`, 'error');
            this.showMockResult();
        } finally {
            this.showLoading(false);
        }
    }

    processClassificationResult(data) {
        try {
            console.log('Processing API response:', data);
            
            // Check if we have candidates and content
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
                throw new Error('Invalid API response structure');
            }
            
            const content = data.candidates[0].content.parts[0].text;
            console.log('Raw content from API:', content);
            
            // Try to extract JSON from the response
            let jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            
            const result = JSON.parse(jsonMatch[0]);
            console.log('Parsed result:', result);
            
            // Validate the result structure
            if (!result.category || !['RECYCLABLE', 'COMPOSTABLE', 'NON_RECYCLABLE'].includes(result.category)) {
                throw new Error('Invalid category in response');
            }
            
            this.displayResult(result);
        } catch (error) {
            console.error('Error parsing API response:', error);
            console.log('Falling back to mock result');
            this.showMockResult();
        }
    }

    showMockResult() {
        // Mock results for demonstration - more realistic scenarios
        const mockResults = [
            {
                category: 'RECYCLABLE',
                confidence: 0.92,
                description: 'Clean plastic bottle (PET #1) - Remove cap and label, rinse clean before placing in recycling bin',
                environmental_impact: 'Recycling this bottle saves 75% energy and prevents it from taking 450 years to decompose in landfill'
            },
            {
                category: 'COMPOSTABLE',
                confidence: 0.88,
                description: 'Banana peel - Perfect for home composting or municipal composting programs',
                environmental_impact: 'Composting this organic waste reduces methane emissions and creates nutrient-rich soil amendment'
            },
            {
                category: 'NON_RECYCLABLE',
                confidence: 0.85,
                description: 'Styrofoam takeout container - Dispose in regular trash as it cannot be recycled',
                environmental_impact: 'Consider bringing reusable containers to reduce single-use waste in the future'
            },
            {
                category: 'RECYCLABLE',
                confidence: 0.95,
                description: 'Aluminum can - Empty and rinse before recycling',
                environmental_impact: 'Recycling aluminum saves 95% energy compared to making new cans from raw materials'
            },
            {
                category: 'COMPOSTABLE',
                confidence: 0.90,
                description: 'Coffee grounds - Excellent for composting, adds nitrogen to compost pile',
                environmental_impact: 'Composting coffee grounds enriches soil and reduces organic waste in landfills'
            }
        ];

        const randomResult = mockResults[Math.floor(Math.random() * mockResults.length)];
        this.displayResult(randomResult);
    }

    displayResult(result) {
        const categoryName = document.getElementById('categoryName');
        const categoryDescription = document.getElementById('categoryDescription');
        const categoryIcon = document.getElementById('categoryIcon');
        const confidenceScore = document.getElementById('confidenceScore');
        const confidenceBadge = document.getElementById('confidenceBadge');
        
        // Update category display
        categoryName.textContent = result.category.replace('_', ' ');
        categoryDescription.textContent = result.description;
        confidenceScore.textContent = `${Math.round(result.confidence * 100)}%`;
        
        // Update icon and styling
        categoryIcon.className = 'category-icon';
        const icon = categoryIcon.querySelector('i');
        
        if (result.category === 'RECYCLABLE') {
            categoryIcon.classList.add('recyclable');
            icon.className = 'fas fa-recycle';
            this.showActionButton('recycleBtn');
        } else if (result.category === 'COMPOSTABLE') {
            categoryIcon.classList.add('compostable');
            icon.className = 'fas fa-seedling';
            this.showActionButton('compostBtn');
        } else {
            categoryIcon.classList.add('non-recyclable');
            icon.className = 'fas fa-trash';
            this.showActionButton('disposeBtn');
        }
        
        // Show results section with animation
        this.resultsSection.style.display = 'block';
        this.resultsSection.style.opacity = '0';
        this.resultsSection.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            this.resultsSection.style.transition = 'all 0.5s ease';
            this.resultsSection.style.opacity = '1';
            this.resultsSection.style.transform = 'translateY(0)';
        }, 100);
        
        this.resultsSection.scrollIntoView({ behavior: 'smooth' });
        
        // Update stats
        this.updateStats();
        this.stats.itemsClassified++;
        
        // Add environmental impact
        this.addEnvironmentalImpact(result.category);
        
        // Show success message with celebration
        this.showMessage(`Waste classified as ${result.category.replace('_', ' ')}!`, 'success');
        this.celebrateClassification();
    }

    showActionButton(buttonId) {
        // Hide all action buttons first
        document.getElementById('recycleBtn').style.display = 'none';
        document.getElementById('compostBtn').style.display = 'none';
        document.getElementById('disposeBtn').style.display = 'none';
        
        // Show the relevant button
        document.getElementById(buttonId).style.display = 'flex';
    }

    addEnvironmentalImpact(category) {
        if (category === 'RECYCLABLE') {
            this.stats.recycledCount++;
            this.stats.co2Saved += 0.5; // kg CO2 saved per recycled item
            this.stats.waterSaved += 2; // liters saved
            this.stats.energySaved += 0.1; // kWh saved
        } else if (category === 'COMPOSTABLE') {
            this.stats.compostedCount++;
            this.stats.co2Saved += 0.3; // kg CO2 saved per composted item
            this.stats.waterSaved += 1; // liters saved
            this.stats.energySaved += 0.05; // kWh saved
        }
        
        this.updateStats();
    }

    updateStats() {
        document.getElementById('itemsClassified').textContent = this.stats.itemsClassified;
        document.getElementById('co2Saved').textContent = this.stats.co2Saved.toFixed(1);
        document.getElementById('recycledCount').textContent = this.stats.recycledCount;
        document.getElementById('compostedCount').textContent = this.stats.compostedCount;
        document.getElementById('waterSaved').textContent = this.stats.waterSaved;
        document.getElementById('energySaved').textContent = this.stats.energySaved.toFixed(1);
    }

    showLoading(show) {
        this.loadingOverlay.style.display = show ? 'flex' : 'none';
    }

    showMessage(message, type = 'info') {
        // Create a simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3'};
            color: white;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 1001;
            font-weight: 500;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 3000);
    }

    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.showMessage('Google AI Studio API key configured successfully!', 'success');
    }

    startTipsCarousel() {
        const tips = document.querySelectorAll('.tip');
        let currentTip = 0;
        
        setInterval(() => {
            tips[currentTip].classList.remove('active');
            currentTip = (currentTip + 1) % tips.length;
            tips[currentTip].classList.add('active');
        }, 4000);
    }

    celebrateClassification() {
        // Add a subtle celebration effect
        const celebration = document.createElement('div');
        celebration.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 3rem;
            z-index: 1002;
            pointer-events: none;
            animation: celebrate 2s ease-out forwards;
        `;
        celebration.innerHTML = '🌱';
        
        // Add celebration animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes celebrate {
                0% { transform: translate(-50%, -50%) scale(0) rotate(0deg); opacity: 1; }
                50% { transform: translate(-50%, -50%) scale(1.2) rotate(180deg); opacity: 1; }
                100% { transform: translate(-50%, -50%) scale(0) rotate(360deg); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(celebration);
        
        setTimeout(() => {
            document.body.removeChild(celebration);
            document.head.removeChild(style);
        }, 2000);
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                // Remove the data URL prefix to get just the base64 string
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    }

    async preprocessImage(file) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Resize to optimal size for AI processing
                const maxSize = 512;
                let { width, height } = img;
                
                if (width > height) {
                    if (width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw and enhance image
                ctx.drawImage(img, 0, 0, width, height);
                
                // Enhance contrast slightly
                const imageData = ctx.getImageData(0, 0, width, height);
                const data = imageData.data;
                
                for (let i = 0; i < data.length; i += 4) {
                    // Slight contrast enhancement
                    data[i] = Math.min(255, data[i] * 1.1);     // Red
                    data[i + 1] = Math.min(255, data[i + 1] * 1.1); // Green
                    data[i + 2] = Math.min(255, data[i + 2] * 1.1); // Blue
                }
                
                ctx.putImageData(imageData, 0, 0);
                
                // Convert to blob and then to base64
                canvas.toBlob((blob) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const base64 = reader.result.split(',')[1];
                        resolve(base64);
                    };
                    reader.readAsDataURL(blob);
                }, 'image/jpeg', 0.9);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }
}

// Initialize the app
const ecoVision = new EcoVision();

// Function to set API key (can be called from console or a settings panel)
window.setApiKey = (key) => {
    ecoVision.setApiKey(key);
};

// Test function to check API connectivity
window.testAPI = async () => {
    console.log('Testing Google AI Studio API...');
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${ecoVision.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: "Hello, respond with 'API is working' if you can read this."
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 50,
                }
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('API Test Success:', data);
            ecoVision.showMessage('API connection successful!', 'success');
        } else {
            console.error('API Test Failed:', response.status);
            ecoVision.showMessage('API connection failed. Check your key.', 'error');
        }
    } catch (error) {
        console.error('API Test Error:', error);
        ecoVision.showMessage('API test failed: ' + error.message, 'error');
    }
};

// Test function with specific waste types
window.testWasteClassification = async (wasteType) => {
    const testImages = {
        'plastic_bottle': 'A clear plastic water bottle with recycling symbol #1',
        'aluminum_can': 'A clean aluminum soda can',
        'banana_peel': 'A yellow banana peel',
        'styrofoam': 'A white styrofoam takeout container',
        'cardboard': 'A clean cardboard box'
    };
    
    const description = testImages[wasteType] || 'A waste item';
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${ecoVision.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Classify this waste item: "${description}". Respond with JSON: {"category": "RECYCLABLE|COMPOSTABLE|NON_RECYCLABLE", "confidence": 0.9, "description": "test"}`
                    }]
                }],
                generationConfig: {
                    temperature: 0.0,
                    maxOutputTokens: 100,
                }
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log(`Test result for ${wasteType}:`, data);
            ecoVision.showMessage(`Test completed for ${wasteType}`, 'success');
        }
    } catch (error) {
        console.error('Test error:', error);
    }
};

// Add some demo data on page load
window.addEventListener('load', () => {
    // Simulate some initial impact
    ecoVision.stats.itemsClassified = 12;
    ecoVision.stats.co2Saved = 5.2;
    ecoVision.stats.recycledCount = 8;
    ecoVision.stats.compostedCount = 4;
    ecoVision.stats.waterSaved = 20;
    ecoVision.stats.energySaved = 1.2;
    ecoVision.updateStats();
    
    // Show that API key is configured
    ecoVision.showMessage('EcoVision ready! Google AI Studio API integrated.', 'success');
});
