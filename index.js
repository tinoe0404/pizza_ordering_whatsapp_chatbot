require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const app = express();

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

app.use(bodyParser.urlencoded({ extended: false }));

// In-memory storage (replace with DB in production)
const userSessions = {};

// Pizza menu configuration
const PIZZA_MENU = {
  sizes: [
    { id: 1, name: 'Small', price: 10 },
    { id: 2, name: 'Medium', price: 15 },
    { id: 3, name: 'Large', price: 20 }
  ],
  toppings: [
    { name: 'Pepperoni', price: 2 },
    { name: 'Mushrooms', price: 1.5 },
    { name: 'Olives', price: 1 },
    { name: 'Extra Cheese', price: 2.5 },
    { name: 'Sausage', price: 2 },
    { name: 'Bell Peppers', price: 1 }
  ]
};

app.get('/test', (req, res) => {
  try {
    const {userMessage, userPhone} = req.query;
    console.log('Test endpoint called:', { userMessage, userPhone });

    if (!userPhone) {
      return res.status(400).send('Missing phone number');
    }

    // Immediately respond to Twilio (required)
    res.status(200).send();

    // Process message asynchronously
    processMessageAsync(userMessage, userPhone);
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send();
  }
});

app.post('/webhook', (req, res) => {
  try {
    console.log('Webhook received:', req.body);
    
    const userMessage = req.body.Body ? req.body.Body.trim() : '';
    const userPhone = req.body.From;

    console.log('Processing message:', { userMessage, userPhone });

    if (!userPhone) {
      console.error('Missing phone number in request');
      return res.status(400).send('Missing phone number');
    }

    // Immediately respond to Twilio (required)
    res.status(200).send();

    // Process message asynchronously
    processMessageAsync(userMessage, userPhone);
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send();
  }
});

app.get('/webhook', (req, res) => {
  // WhatsApp webhook verification
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('Webhook verification request:', { mode, token, challenge });

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log('Webhook verified successfully!');
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      console.log('Webhook verification failed - invalid token');
      res.sendStatus(403);
    }
  } else {
    // Return a simple response for GET requests without verification params
    res.status(200).send('Webhook is running');
  }
});

async function processMessageAsync(msg, phone) {
  try {
    console.log(`Processing message from ${phone}: "${msg}"`);
    
    // Initialize or get user session
    if (!userSessions[phone]) {
      console.log('Creating new session for:', phone);
      userSessions[phone] = { 
        step: 'greeting',
        order: {},
        startTime: new Date()
      };
    }

    const session = userSessions[phone];
    console.log('Current session state:', session);
    
    const response = handleUserMessage(msg, session, phone);
    console.log('Generated response:', response);
    
    // Send WhatsApp reply
    const message = await client.messages.create({
      body: response,
      from: 'whatsapp:+14155238886',
      to: phone
    });
    
    console.log('Message sent successfully:', message.sid);
    
  } catch (error) {
    console.error('Message processing error:', error);
    console.error('Error details:', error.stack);
    
    // Send error message to user
    try {
      await client.messages.create({
        body: "Sorry, something went wrong. Please try again.",
        from: 'whatsapp:+14155238886',
        to: phone
      });
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }
}

function handleUserMessage(message, session, phone) {
  const msg = message.toLowerCase().trim();
  console.log(`Handling message: "${msg}" in step: ${session.step}`);
  
  // Handle common restart commands
  if (msg === 'menu' || msg === 'start' || msg === 'restart') {
    session.step = 'main_menu';
    return getMainMenuMessage();
  }
  
  switch (session.step) {
    case 'greeting':
      return handleGreeting(msg, session);
    
    case 'main_menu':
      return handleMainMenu(msg, session);
    
    case 'size_selection':
      return handleSizeSelection(msg, session);
    
    case 'toppings_selection':
      return handleToppingsSelection(msg, session);
    
    case 'order_confirmation':
      return handleOrderConfirmation(msg, session);
    
    case 'customer_info':
      return handleCustomerInfo(msg, session);
    
    default:
      console.log('Unknown step, resetting to main menu');
      session.step = 'main_menu';
      return getMainMenuMessage();
  }
}

function handleGreeting(msg, session) {
  console.log('Handling greeting');
  session.step = 'main_menu';
  return getMainMenuMessage();
}

function getMainMenuMessage() {
  return `🍕 Welcome to Tony's Pizza Bot! 🍕

What would you like to do?

1️⃣ Order a Pizza
2️⃣ View Menu
3️⃣ Track Order
4️⃣ Contact Us

Reply with the number of your choice!`;
}

function handleMainMenu(msg, session) {
  console.log('Handling main menu selection:', msg);
  
  switch (msg) {
    case '1':
    case 'order':
      session.step = 'size_selection';
      return getSizeSelectionMessage();
    
    case '2':
    case 'menu':
      return getFullMenuMessage();
    
    case '3':
    case 'track':
      return "🚚 Order tracking coming soon! For now, your pizza will be ready in 20-30 minutes.";
    
    case '4':
    case 'contact':
      return "📞 Contact us at: (555) 123-PIZZA\n📧 Email: orders@tonyspizza.com\n\nReply 'menu' to return to main menu.";
    
    default:
      return "Please reply with 1, 2, 3, or 4 to make your selection.\n\nOr type 'menu' to see options again.";
  }
}

function getSizeSelectionMessage() {
  let message = "🍕 Choose your pizza size:\n\n";
  PIZZA_MENU.sizes.forEach(size => {
    message += `${size.id}️⃣ ${size.name} - $${size.price}\n`;
  });
  message += "\nReply with the number of your choice!";
  return message;
}

function handleSizeSelection(msg, session) {
  const sizeId = parseInt(msg);
  const selectedSize = PIZZA_MENU.sizes.find(size => size.id === sizeId);
  
  if (!selectedSize) {
    return "Please select a valid size (1, 2, or 3).";
  }
  
  session.order.size = selectedSize;
  session.order.toppings = [];
  session.step = 'toppings_selection';
  
  return getToppingsSelectionMessage();
}

function getToppingsSelectionMessage() {
  let message = "🧀 Choose your toppings (optional):\n\n";
  PIZZA_MENU.toppings.forEach((topping, index) => {
    message += `${index + 1}️⃣ ${topping.name} - $${topping.price}\n`;
  });
  message += "\n✅ Reply 'done' when finished\n";
  message += "❌ Reply 'none' for plain pizza\n";
  message += "📝 You can select multiple toppings by sending their numbers (e.g., '1 3 5')";
  return message;
}

function handleToppingsSelection(msg, session) {
  if (msg === 'done') {
    session.step = 'order_confirmation';
    return getOrderConfirmationMessage(session);
  }
  
  if (msg === 'none') {
    session.order.toppings = [];
    session.step = 'order_confirmation';
    return getOrderConfirmationMessage(session);
  }
  
  // Handle multiple topping selections
  const toppingNumbers = msg.split(/\s+/).map(num => parseInt(num.trim()));
  const validToppings = [];
  
  for (const num of toppingNumbers) {
    if (num >= 1 && num <= PIZZA_MENU.toppings.length) {
      const topping = PIZZA_MENU.toppings[num - 1];
      if (!session.order.toppings.find(t => t.name === topping.name)) {
        validToppings.push(topping);
      }
    }
  }
  
  if (validToppings.length > 0) {
    session.order.toppings.push(...validToppings);
    let response = "✅ Added toppings:\n";
    validToppings.forEach(topping => {
      response += `• ${topping.name} - $${topping.price}\n`;
    });
    response += "\nAdd more toppings, or reply 'done' to continue.";
    return response;
  }
  
  return "Please enter valid topping numbers, 'done' to finish, or 'none' for plain pizza.";
}

function getOrderConfirmationMessage(session) {
  const order = session.order;
  let total = order.size.price;
  
  let message = "📋 Order Summary:\n\n";
  message += `🍕 ${order.size.name} Pizza - $${order.size.price}\n`;
  
  if (order.toppings.length > 0) {
    message += "\n🧀 Toppings:\n";
    order.toppings.forEach(topping => {
      message += `• ${topping.name} - $${topping.price}\n`;
      total += topping.price;
    });
  }
  
  message += `\n💰 Total: $${total.toFixed(2)}\n\n`;
  message += "✅ Reply 'confirm' to place order\n";
  message += "❌ Reply 'cancel' to start over";
  
  return message;
}

function handleOrderConfirmation(msg, session) {
  if (msg === 'confirm') {
    session.step = 'customer_info';
    return "📝 Great! Please provide your delivery address:";
  }
  
  if (msg === 'cancel') {
    session.step = 'main_menu';
    session.order = {};
    return "❌ Order cancelled. " + getMainMenuMessage();
  }
  
  return "Please reply 'confirm' to place your order or 'cancel' to start over.";
}

function handleCustomerInfo(msg, session) {
  session.order.address = msg;
  const orderNumber = generateOrderNumber();
  
  // Calculate total
  let total = session.order.size.price;
  session.order.toppings.forEach(topping => {
    total += topping.price;
  });
  
  const orderSummary = `🎉 Order confirmed!

📋 Order #${orderNumber}
🍕 ${session.order.size.name} Pizza
🧀 Toppings: ${session.order.toppings.length > 0 ? session.order.toppings.map(t => t.name).join(', ') : 'None'}
📍 Address: ${session.order.address}
💰 Total: $${total.toFixed(2)}

⏰ Estimated delivery: 25-35 minutes
📞 Questions? Call (555) 123-PIZZA

Thanks for choosing Tony's Pizza! 🍕

Reply 'menu' to start a new order!`;

  // Reset session but don't delete it completely
  session.step = 'main_menu';
  session.order = {};
  
  return orderSummary;
}

function getFullMenuMessage() {
  let message = "🍕 TONY'S PIZZA MENU 🍕\n\n";
  
  message += "📏 SIZES:\n";
  PIZZA_MENU.sizes.forEach(size => {
    message += `• ${size.name} - $${size.price}\n`;
  });
  
  message += "\n🧀 TOPPINGS:\n";
  PIZZA_MENU.toppings.forEach(topping => {
    message += `• ${topping.name} - $${topping.price}\n`;
  });
  
  message += "\nReply 'order' to start ordering or 'menu' for main options!";
  return message;
}

function generateOrderNumber() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeSessions: Object.keys(userSessions).length
  });
});

// Add session cleanup (run every 30 minutes to prevent memory leaks)
setInterval(() => {
  const now = new Date();
  Object.keys(userSessions).forEach(phone => {
    const session = userSessions[phone];
    const timeDiff = now - session.startTime;
    // Remove sessions older than 2 hours
    if (timeDiff > 2 * 60 * 60 * 1000) {
      console.log(`Cleaning up old session for ${phone}`);
      delete userSessions[phone];
    }
  });
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🍕 PizzaBot server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});