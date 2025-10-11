// Global error handling middleware
export const errorHandler = (err, req, res, next) => {
  console.error('Error stack:', err.stack)

  // Default error
  let error = {
    status: err.statusCode || 500,
    message: err.message || 'Internal Server Error'
  }

  // PostgreSQL specific errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        error = {
          status: 409,
          message: 'Resource already exists'
        }
        break
      case '23503': // Foreign key violation
        error = {
          status: 400,
          message: 'Referenced resource does not exist'
        }
        break
      case '23514': // Check violation
        error = {
          status: 400,
          message: 'Invalid data provided'
        }
        break
      case '42P01': // Undefined table
        error = {
          status: 500,
          message: 'Database configuration error'
        }
        break
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = {
      status: 401,
      message: 'Invalid token'
    }
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      status: 401,
      message: 'Token expired'
    }
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    error = {
      status: 400,
      message: err.message
    }
  }

  // Send error response
  res.status(error.status).json({
    error: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  })
}

// Async error wrapper
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}